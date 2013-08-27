/*jslint indent: 2, maxlen: 80, sloppy: true, nomen: true */
/*global Deferred, exports, setInterval, setTimeout, clearInterval,
  clearTimeout */

/**
 * Promise()
 *
 * @class Promise
 * @constructor
 */
function Promise() {
  this._onReject = [];
  this._onResolve = [];
  this._onProgress = [];
  this._state = "";
  this._answers = undefined;
}

////////////////////////////////////////////////////////////
// http://wiki.commonjs.org/wiki/Promises/B
// when(value, callback, errback_opt)

/**
 * when(item, [onSuccess], [onError], [onProgress]): Promise
 *
 * Return an item as first parameter of the promise answer. If item is of
 * type Promise, the method will just return the promise. If item is of type
 * Deferred, the method will return the deferred promise.
 *
 *     Promise.when('a').then(console.log); // shows 'a'
 *
 * @method when
 * @static
 * @param  {Any} item The item to use
 * @param  {Function} [onSuccess] The callback called on success
 * @param  {Function} [onError] the callback called on error
 * @param  {Function} [onProgress] the callback called on progress
 * @return {Promise} The promise
 */
Promise.when = function (item, onSuccess, onError, onProgress) {
  if (item instanceof Promise) {
    return item.done(onSuccess).fail(onError).progress(onProgress);
  }
  if (typeof Deferred === 'function' && item instanceof Deferred) {
    return item.promise().done(onSuccess).fail(onError).progress(onProgress);
  }
  var p = new Promise().done(onSuccess).fail(onError).progress(onProgress);
  p.defer().resolve(item);
  return p;
};

/**
 * error(value, [onError]): Promise
 *
 * Return value as first parameter of the promise answer. The method returns a
 * rejected promise.
 *
 *     Promise.error('a').then(null, console.log); // shows 'a'
 *
 * @method error
 * @static
 * @param  {Any} value The value to use
 * @param  {Function} [onError] the callback called on error
 * @return {Promise} The promise
 */
Promise.error = function (value, onError) {
  var p = new Promise().fail(onError);
  p.defer().reject(value);
  return p;
};

////////////////////////////////////////////////////////////
// http://wiki.commonjs.org/wiki/Promises/B
// get(object, name)

/**
 * get(dict, property): Promise
 *
 * Return the dict property as first parameter of the promise answer.
 *
 *     Promise.get({'a': 'b'}, 'a').then(console.log); // shows 'b'
 *
 * @method get
 * @static
 * @param  {Object} dict The object to use
 * @param  {String} property The object property name
 * @return {Promise} The promise
 */
Promise.get = function (dict, property) {
  var p = new Promise(), solver = p.defer();
  try {
    solver.resolve(dict[property]);
  } catch (e) {
    solver.reject(e);
  }
  return p;
};

////////////////////////////////////////////////////////////
// http://wiki.commonjs.org/wiki/Promises/B
// put(object, name, value)

/**
 * put(dict, property, value): Promise
 *
 * Set and return the dict property as first parameter of the promise answer.
 *
 *     Promise.put({'a': 'b'}, 'a', 'c').then(console.log); // shows 'c'
 *
 * @method put
 * @static
 * @param  {Object} dict The object to use
 * @param  {String} property The object property name
 * @param  {Any} value The value
 * @return {Promise} The promise
 */
Promise.put = function (dict, property, value) {
  var p = new Promise(), solver = p.defer();
  try {
    dict[property] = value;
    solver.resolve(dict[property]);
  } catch (e) {
    solver.reject(e);
  }
  return p;
};

/**
 * execute(callback): Promise
 *
 * Execute the callback and use the returned value as promise answer.
 *
 *     Promise.execute(function () {
 *       return 'a';
 *     }).then(console.log); // shows 'a'
 *
 * @method execute
 * @static
 * @param  {Function} callback The callback to execute
 * @return {Promise} The promise
 */
Promise.execute = function (callback) {
  var p = new Promise(), solver = p.defer();
  try {
    Promise.when(callback(), solver.resolve, solver.reject);
  } catch (e) {
    solver.reject(e);
  }
  return p;
};

/**
 * all(items): Promise
 *
 * Resolve the promise. The item type must be like the item parameter of the
 * `when` static method.
 *
 *     Promise.all([promisedError, 'b']).
 *       then(console.log); // shows [Error, 'b']
 *
 * @method all
 * @static
 * @param  {Array} items The items to use
 * @return {Promise} The promise
 */
Promise.all = function (items) {
  var array = [], count = 0, next = new Promise(), solver, i;
  solver = next.defer();
  function succeed(i) {
    return function (answer) {
      array[i] = answer;
      count += 1;
      if (count !== items.length) {
        return;
      }
      return solver.resolve(array);
    };
  }
  for (i = 0; i < items.length; i += 1) {
    Promise.when(items[i], succeed(i), succeed(i));
  }
  return next;
};

/**
 * allOrNone(items): Promise
 *
 * Resolve the promise only when all items are resolved. If one item fails, then
 * reject. The item type must be like the item parameter of the `when` static
 * method.
 *
 *     Promise.allOrNone([Promise.when('a'), 'b']).
 *       then(console.log); // shows ['a', 'b']
 *
 * @method allOrNone
 * @static
 * @param  {Array} items The items to use
 * @return {Promise} The promise
 */
Promise.allOrNone = function (items) {
  var array = [], count = 0, next = new Promise(), solver;
  solver = next.defer();
  items.forEach(function (item, i) {
    Promise.when(item, function (answer) {
      array[i] = answer;
      count += 1;
      if (count !== items.length) {
        return;
      }
      return solver.resolve(array);
    }, function (answer) {
      return solver.reject(answer);
    });
  });
  return next;
};

/**
 * any(items): Promise
 *
 * Resolve the promise only when one of the items is resolved. The item type
 * must be like the item parameter of the `when` static method.
 *
 *     Promise.any([promisedError, Promise.delay(10)]).
 *       then(console.log); // shows 10
 *
 * @method any
 * @static
 * @param  {Array} items The items to use
 * @return {Promise} The promise
 */
Promise.any = function (items) {
  var count = 0, next = new Promise(), solver, i;
  solver = next.defer();
  function onError(answer) {
    count += 1;
    if (count === items.length) {
      solver.reject(answer);
    }
  }
  for (i = 0; i < items.length; i += 1) {
    Promise.when(items[i], solver.resolve, onError);
  }
  return next;
};

/**
 * first(items): Promise
 *
 * Resolve the promise only when one item is resolved. The item type must be
 * like the item parameter of the `when` static method.
 *
 *     Promise.first([Promise.delay(100), 'b']).then(console.log); // shows 'b'
 *
 * @method first
 * @static
 * @param  {Array} items The items to use
 * @return {Promise} The promise
 */
Promise.first = function (items) { // *promises
  var next = new Promise(), solver = next.defer(), i;
  for (i = 0; i < items.length; i += 1) {
    Promise.when(items[i], solver.resolve, solver.reject);
  }
  return next;
};

/**
 * delay(timeout[, every]): Promise
 *
 * Resolve the promise after `timeout` milliseconds and notfies us every `every`
 * milliseconds.
 *
 *     Promise.delay(50, 10).then(console.log, console.error, console.log);
 *     // // shows
 *     // 10 // from progress
 *     // 20 // from progress
 *     // 30 // from progress
 *     // 40 // from progress
 *     // 50 // from success
 *
 * @method delay
 * @static
 * @param  {Number} timeout In milliseconds
 * @param  {Number} [every] In milliseconds
 * @return {Promise} The promise
 */
Promise.delay = function (timeout, every) {
  var next = new Promise(), solver, ident, now = 0;
  solver = next.defer();
  if (typeof every === 'number' && !isNaN(every)) {
    ident = setInterval(function () {
      now += every;
      solver.notify(now);
    }, every);
  }
  setTimeout(function () {
    clearInterval(ident);
    solver.resolve(timeout);
  }, timeout);
  return next;
};

/**
 * timeout(item, timeout): Promise
 *
 * If the promise is not resolved after `timeout` milliseconds, it returns a
 * timeout error.
 *
 *     Promise.timeout('a', 100).then(console.log); // shows 'a'
 *
 *     Promise.timeout(Promise.delay(100), 10).then(console.log, console.error);
 *     // shows Error Timeout
 *
 * @method timeout
 * @static
 * @param  {Any} Item The item to use
 * @param  {Number} timeout In milliseconds
 * @return {Promise} The promise
 */
Promise.timeout = function (item, timeout) {
  var next = new Promise(), solver, i;
  solver = next.defer();
  i = setTimeout(function () {
    solver.reject.apply(next, [new Error("Timeout")]);
  }, timeout);
  Promise.when(item, function () {
    clearTimeout(i);
    solver.resolve.apply(next, arguments);
  }, function () {
    clearTimeout(i);
    solver.reject.apply(next, arguments);
  });
  return next;
};

/**
 * defer([callback]): Promise
 *
 * Set the promise to the 'running' state. If `callback` is a function, then it
 * will be executed with a solver as first parameter and returns the promise.
 * Else it returns the promise solver.
 *
 * @method defer
 * @param  {Function} [callback] The callback to execute
 * @return {Promise,Object} The promise or the promise solver
 */
Promise.prototype.defer = function (callback) {
  var that = this;
  switch (this._state) {
  case "running":
  case "resolved":
  case "rejected":
    throw new Error("Promise().defer(): Already " + this._state);
  default:
    break;
  }
  function createSolver() {
    return {
      "resolve": function () {
        var array;
        if (that._state !== "resolved" && that._state !== "rejected") {
          that._state = "resolved";
          that._answers = arguments;
          array = that._onResolve.slice();
          setTimeout(function () {
            var i;
            for (i = 0; i < array.length; i += 1) {
              try {
                array[i].apply(that, that._answers);
              } catch (ignore) {}
            }
          });
          // free the memory
          that._onResolve = undefined;
          that._onReject = undefined;
          that._onProgress = undefined;
        }
      },
      "reject": function () {
        var array;
        if (that._state !== "resolved" && that._state !== "rejected") {
          that._state = "rejected";
          that._answers = arguments;
          array = that._onReject.slice();
          setTimeout(function () {
            var i;
            for (i = 0; i < array.length; i += 1) {
              try {
                array[i].apply(that, that._answers);
              } catch (ignore) {}
            }
          });
          // free the memory
          that._onResolve = undefined;
          that._onReject = undefined;
          that._onProgress = undefined;
        }
      },
      "notify": function () {
        if (that._onProgress) {
          var i;
          for (i = 0; i < that._onProgress.length; i += 1) {
            try {
              that._onProgress[i].apply(that, arguments);
            } catch (ignore) {}
          }
        }
      }
    };
  }
  this._state = "running";
  if (typeof callback === 'function') {
    callback(createSolver());
    return this;
  }
  return createSolver();
};

////////////////////////////////////////////////////////////
// http://wiki.commonjs.org/wiki/Promises/A
// then(fulfilledHandler, errorHandler, progressHandler)

/**
 * then([onSuccess], [onError], [onProgress]): Promise
 *
 * Returns a new Promise with the return value of the `onSuccess` or `onError`
 * callback as first parameter. If the pervious promise is resolved, the
 * `onSuccess` callback is called. If rejected, the `onError` callback is
 * called. If notified, `onProgress` is called.
 *
 *     Promise.when(1).
 *       then(function (one) { return one + 1; }).
 *       then(console.log); // shows 2
 *
 * @method then
 * @param  {Function} [onSuccess] The callback to call on resolve
 * @param  {Function} [onError] The callback to call on reject
 * @param  {Function} [onProgress] The callback to call on notify
 * @return {Promise} The new promise
 */
Promise.prototype.then = function (onSuccess, onError, onProgress) {
  var next = new Promise(), that = this;
  switch (this._state) {
  case "resolved":
    if (typeof onSuccess === 'function') {
      next.defer(function (resolver) {
        try {
          resolver.resolve(onSuccess.apply(that, that._answers));
        } catch (e) {
          resolver.reject(e);
        }
      });
    }
    break;
  case "rejected":
    if (typeof onError === 'function') {
      next.defer(function (resolver) {
        try {
          resolver.resolve(onError.apply(that, that._answers));
        } catch (e) {
          resolver.reject(e);
        }
      });
    }
    break;
  default:
    if (typeof onSuccess === 'function') {
      this._onResolve.push(function () {
        var answers = arguments;
        next.defer(function (resolver) {
          try {
            resolver.resolve(onSuccess.apply(that, answers));
          } catch (e) {
            resolver.reject(e);
          }
        });
      });
    }
    if (typeof onError === 'function') {
      this._onReject.push(function () {
        var answers = arguments;
        next.defer(function (resolver) {
          try {
            resolver.resolve(onError.apply(that, answers));
          } catch (e) {
            resolver.reject(e);
          }
        });
      });
    }
    if (typeof onProgress === 'function') {
      this._onProgress.push(onProgress);
    }
    break;
  }
  return next;
};

////////////////////////////////////////////////////////////
// http://wiki.commonjs.org/wiki/Promises/A
// get(propertyName)

/**
 * get(property): Promise
 *
 * Get the property of the promise response as first parameter of the new
 * Promise.
 *
 *     Promise.when({'a': 'b'}).get('a').then(console.log); // shows 'b'
 *
 * @method get
 * @param  {String} property The object property name
 * @return {Promise} The promise
 */
Promise.prototype.get = function (property) {
  return this.then(function (dict) {
    return dict[property];
  });
};

////////////////////////////////////////////////////////////
// http://wiki.commonjs.org/wiki/Promises/A
// call(functionName, arg1, arg2, ...)
Promise.prototype.call = function (function_name) {
  var args = Array.prototype.slice.call(arguments, 1);
  return this.then(function (dict) {
    return dict[function_name].apply(dict, args);
  });
};

/**
 * done(callback): Promise
 *
 * Call the callback on resolve.
 *
 *     Promise.when(1).
 *       done(function (one) { return one + 1; }).
 *       done(console.log); // shows 1
 *
 * @method done
 * @param  {Function} callback The callback to call on resolve
 * @return {Promise} This promise
 */
Promise.prototype.done = function (callback) {
  var that = this;
  if (typeof callback !== 'function') {
    return this;
  }
  switch (this._state) {
  case "resolved":
    setTimeout(function () {
      callback.apply(that, that._answers);
    });
    break;
  case "rejected":
    break;
  default:
    this._onResolve.push(callback);
    break;
  }
  return this;
};

/**
 * fail(callback): Promise
 *
 * Call the callback on reject.
 *
 *     promisedTypeError().
 *       fail(function (e) { name_error(); }).
 *       fail(console.log); // shows TypeError
 *
 * @method fail
 * @param  {Function} callback The callback to call on reject
 * @return {Promise} This promise
 */
Promise.prototype.fail = function (callback) {
  var that = this;
  if (typeof callback !== 'function') {
    return this;
  }
  switch (this._state) {
  case "rejected":
    setTimeout(function () {
      callback.apply(that, that._answers);
    });
    break;
  case "resolved":
    break;
  default:
    this._onReject.push(callback);
    break;
  }
  return this;
};

/**
 * progress(callback): Promise
 *
 * Call the callback on notify.
 *
 *     Promise.delay(100, 10).
 *       progress(function () { return null; }).
 *       progress(console.log); // does not show null
 *
 * @method progress
 * @param  {Function} callback The callback to call on notify
 * @return {Promise} This promise
 */
Promise.prototype.progress = function (callback) {
  if (typeof callback !== 'function') {
    return this;
  }
  switch (this._state) {
  case "rejected":
  case "resolved":
    break;
  default:
    this._onProgress.push(callback);
    break;
  }
  return this;
};

/**
 * always(callback): Promise
 *
 * Call the callback on resolve or on reject.
 *
 *     sayHello().
 *       done(iAnswer).
 *       fail(iHeardNothing).
 *       always(iKeepWalkingAnyway);
 *
 * @method always
 * @param  {Function} callback The callback to call on resolve or on reject
 * @return {Promise} This promise
 */
Promise.prototype.always = function (callback) {
  var that = this;
  if (typeof callback !== 'function') {
    return this;
  }
  switch (this._state) {
  case "resolved":
  case "rejected":
    setTimeout(function () {
      callback.apply(that, that._answers);
    });
    break;
  default:
    that._onReject.push(callback);
    that._onResolve.push(callback);
    break;
  }
  return this;
};


function Deferred() {
  this._promise = new Promise();
  this._solver = this._promise.defer();
}

Deferred.prototype.resolve = function () {
  this._solver.resolve.apply(this._solver, arguments);
};

Deferred.prototype.reject = function () {
  this._solver.reject.apply(this._solver, arguments);
};

Deferred.prototype.notify = function () {
  this._solver.notify.apply(this._solver, arguments);
};

Deferred.prototype.promise = function () {
  return this._promise;
};

exports.Promise = Promise;
exports.Deferred = Deferred;
