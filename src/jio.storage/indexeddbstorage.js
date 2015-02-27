/*
 * Copyright 2014, Nexedi SA
 * Released under the LGPL license.
 * http://www.gnu.org/licenses/lgpl.html
 */

/**
 * JIO Indexed Database Storage.
 *
 * A local browser "database" storage greatly more powerful than localStorage.
 *
 * Description:
 *
 *    {
 *      "type": "indexeddb",
 *      "database": <string>
 *    }
 *
 * The database name will be prefixed by "jio:", so if the database property is
 * "hello", then you can manually reach this database with
 * `indexedDB.open("jio:hello");`. (Or
 * `indexedDB.deleteDatabase("jio:hello");`.)
 *
 * For more informations:
 *
 * - http://www.w3.org/TR/IndexedDB/
 * - https://developer.mozilla.org/en-US/docs/IndexedDB/Using_IndexedDB
 */

/*jslint nomen: true */
/*global indexedDB, jIO, RSVP, Blob, Math*/

(function (indexedDB, jIO, RSVP, Blob, Math) {
  "use strict";

  // Read only as changing it can lead to data corruption
  var UNITE = 2000000;

  function IndexedDBStorage(description) {
    if (typeof description.database !== "string" ||
        description.database === "") {
      throw new TypeError("IndexedDBStorage 'database' description property " +
                          "must be a non-empty string");
    }
    this._database_name = "jio:" + description.database;
  }

  IndexedDBStorage.prototype.hasCapacity = function (name) {
    return (name === "list");
  };

  function buildKeyPath(key_list) {
    return key_list.join("_");
  }

  function handleUpgradeNeeded(evt) {
    var db = evt.target.result,
      store;

    store = db.createObjectStore("metadata", {
      keyPath: "_id",
      autoIncrement: false
    });
    // It is not possible to use openKeyCursor on keypath directly
    // https://www.w3.org/Bugs/Public/show_bug.cgi?id=19955
    store.createIndex("_id", "_id", {unique: true});

    store = db.createObjectStore("attachment", {
      keyPath: "_key_path",
      autoIncrement: false
    });
    store.createIndex("_id", "_id", {unique: false});

    store = db.createObjectStore("blob", {
      keyPath: "_key_path",
      autoIncrement: false
    });
    store.createIndex("_id_attachment",
                      ["_id", "_attachment"], {unique: false});
    store.createIndex("_id", "_id", {unique: false});
  }

  function openIndexedDB(jio_storage) {
    var db_name = jio_storage._database_name;
    function resolver(resolve, reject) {
      // Open DB //
      var request = indexedDB.open(db_name);
      request.onerror = function (error) {
        if (request.result) {
          request.result.close();
        }
        reject(error);
      };

      request.onabort = function () {
        request.result.close();
        reject("Aborting connection to: " + db_name);
      };

      request.ontimeout = function () {
        request.result.close();
        reject("Connection to: " + db_name + " timeout");
      };

      request.onblocked = function () {
        request.result.close();
        reject("Connection to: " + db_name + " was blocked");
      };

      // Create DB if necessary //
      request.onupgradeneeded = handleUpgradeNeeded;

      request.onversionchange = function () {
        request.result.close();
        reject(db_name + " was upgraded");
      };

      request.onsuccess = function () {
        resolve(request.result);
      };
    }
    // XXX Canceller???
    return new RSVP.Queue()
      .push(function () {
        return new RSVP.Promise(resolver);
      });
  }

  function openTransaction(db, stores, flag, autoclosedb) {
    var tx = db.transaction(stores, flag);
    if (autoclosedb !== false) {
      tx.oncomplete = function () {
        db.close();
      };
    }
    tx.onabort = function () {
      db.close();
    };
    return tx;
  }

  function handleCursor(request, callback) {
    function resolver(resolve, reject) {
      // Open DB //
      request.onerror = function (error) {
        if (request.transaction) {
          request.transaction.abort();
        }
        reject(error);
      };

      request.onsuccess = function (evt) {
        var cursor = evt.target.result;
        if (cursor) {
          // XXX Wait for result
          try {
            callback(cursor);
          } catch (error) {
            reject(error);
          }

          // continue to next iteration
          cursor["continue"]();
        } else {
          resolve();
        }
      };
    }
    // XXX Canceller???
    return new RSVP.Promise(resolver);
  }

  IndexedDBStorage.prototype.buildQuery = function () {
    var result_list = [];

    function pushMetadata(cursor) {
      result_list.push({
        "id": cursor.key,
        "value": {}
      });
    }
    return openIndexedDB(this)
      .push(function (db) {
        var tx = openTransaction(db, ["metadata"], "readonly");
        return handleCursor(tx.objectStore("metadata").index("_id")
                            .openKeyCursor(), pushMetadata);
      })
      .push(function () {
        return result_list;
      });

  };

  function handleGet(request) {
    function resolver(resolve, reject) {
      request.onerror = reject;
      request.onsuccess = function () {
        if (request.result) {
          resolve(request.result);
        }
        // XXX How to get ID
        reject(new jIO.util.jIOError("Cannot find document", 404));
      };
    }
    return new RSVP.Promise(resolver);
  }

  IndexedDBStorage.prototype.get = function (param) {
    var attachment_dict = {};

    function addEntry(cursor) {
      attachment_dict[cursor.value._attachment] = {};
    }

    return openIndexedDB(this)
      .push(function (db) {
        var transaction = openTransaction(db, ["metadata", "attachment"],
                                          "readonly");
        return RSVP.all([
          handleGet(transaction.objectStore("metadata").get(param._id)),
          handleCursor(transaction.objectStore("attachment").index("_id")
                       .openCursor(), addEntry)
        ]);
      })
      .push(function (result_list) {
        var result = result_list[0];
        if (Object.getOwnPropertyNames(attachment_dict).length > 0) {
          result._attachments = attachment_dict;
        }
        return result;
      });
  };

  function handleRequest(request) {
    function resolver(resolve, reject) {
      request.onerror = reject;
      request.onsuccess = function () {
        resolve(request.result);
      };
    }
    return new RSVP.Promise(resolver);
  }

  IndexedDBStorage.prototype.put = function (metadata) {
    return openIndexedDB(this)
      .push(function (db) {
        var transaction = openTransaction(db, ["metadata"], "readwrite");
        return handleRequest(transaction.objectStore("metadata").put(metadata));
      });
  };

  function deleteEntry(cursor) {
    cursor["delete"]();
  }

  IndexedDBStorage.prototype.remove = function (param) {
    return openIndexedDB(this)
      .push(function (db) {
        var transaction = openTransaction(db, ["metadata", "attachment",
                                          "blob"], "readwrite");
        return RSVP.all([
          handleRequest(transaction
                        .objectStore("metadata")["delete"](param._id)),
          // XXX Why not possible to delete with KeyCursor?
          handleCursor(transaction.objectStore("attachment").index("_id")
                       .openCursor(), deleteEntry),
          handleCursor(transaction.objectStore("blob").index("_id")
                       .openCursor(), deleteEntry)
        ]);
      });
  };

  IndexedDBStorage.prototype.getAttachment = function (param) {
    var transaction,
      start,
      end;
    return openIndexedDB(this)
      .push(function (db) {
        transaction = openTransaction(db, ["attachment", "blob"], "readonly");
        // XXX Should raise if key is not good
        return handleGet(transaction.objectStore("attachment")
                         .get(buildKeyPath([param._id, param._attachment])));
      })
      .push(function (attachment) {
        var total_length = attachment.info.length,
          i,
          promise_list = [],
          store = transaction.objectStore("blob"),
          start_index,
          end_index;

        start = param._start || 0;
        end = param._end || total_length;
        if (end > total_length) {
          end = total_length;
        }

        if (start < 0 || end < 0) {
          throw new jIO.util.jIOError("_start and _end must be positive",
                                      400);
        }
        if (start > end) {
          throw new jIO.util.jIOError("_start is greater than _end",
                                      400);
        }

        start_index = Math.floor(start / UNITE);
        end_index =  Math.floor(end / UNITE);
        if (end % UNITE === 0) {
          end_index -= 1;
        }

        for (i = start_index; i <= end_index; i += 1) {
          promise_list.push(
            handleGet(store.get(buildKeyPath([param._id,
                                param._attachment, i])))
          );
        }
        return RSVP.all(promise_list);
      })
      .push(function (result_list) {
        var array_buffer_list = [],
          blob,
          i,
          len = result_list.length;
        for (i = 0; i < len; i += 1) {
          array_buffer_list.push(result_list[i].blob);
        }
        blob = new Blob(array_buffer_list, {type: "application/octet-stream"});
        return {data: blob.slice(start, end)};
      });
  };

  function removeAttachment(transaction, param) {
    return RSVP.all([
      // XXX How to get the right attachment
      handleRequest(transaction.objectStore("attachment")["delete"](
        buildKeyPath([param._id, param._attachment])
      )),
      handleCursor(transaction.objectStore("blob").index("_id_attachment")
                   .openCursor(), deleteEntry)
    ]);
  }

  IndexedDBStorage.prototype.putAttachment = function (metadata) {
    var blob_part = [],
      transaction,
      db;

    return openIndexedDB(this)
      .push(function (database) {
        db = database;

        // Split the blob first
        return jIO.util.readBlobAsArrayBuffer(metadata._blob);
      })
      .push(function (event) {
        var array_buffer = event.target.result,
          total_size = metadata._blob.size,
          handled_size = 0;

        while (handled_size < total_size) {
          blob_part.push(array_buffer.slice(handled_size,
                                            handled_size + UNITE));
          handled_size += UNITE;
        }

        // Remove previous attachment
        transaction = openTransaction(db, ["attachment", "blob"], "readwrite");
        return removeAttachment(transaction, metadata);
      })
      .push(function () {

        var promise_list = [
            handleRequest(transaction.objectStore("attachment").put({
              "_key_path": buildKeyPath([metadata._id, metadata._attachment]),
              "_id": metadata._id,
              "_attachment": metadata._attachment,
              "info": {
                "content_type": metadata._blob.type,
                "length": metadata._blob.size
              }
            }))
          ],
          len = blob_part.length,
          blob_store = transaction.objectStore("blob"),
          i;
        for (i = 0; i < len; i += 1) {
          promise_list.push(
            handleRequest(blob_store.put({
              "_key_path": buildKeyPath([metadata._id, metadata._attachment,
                                         i]),
              "_id" : metadata._id,
              "_attachment" : metadata._attachment,
              "_part" : i,
              "blob": blob_part[i]
            }))
          );
        }
        // Store all new data
        return RSVP.all(promise_list);
      });
  };

  IndexedDBStorage.prototype.removeAttachment = function (param) {
    return openIndexedDB(this)
      .push(function (db) {
        var transaction = openTransaction(db, ["attachment", "blob"],
                                          "readwrite");
        return removeAttachment(transaction, param);
      });
  };

  jIO.addStorage("indexeddb", IndexedDBStorage);
}(indexedDB, jIO, RSVP, Blob, Math));
