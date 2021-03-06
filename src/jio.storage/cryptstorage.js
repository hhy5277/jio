/*
 * Copyright 2015, Nexedi SA
 * Released under the LGPL license.
 * http://www.gnu.org/licenses/lgpl.html
 */

/*jslint nomen: true*/
/*global jIO, RSVP, DOMException, Blob, crypto, Uint8Array, ArrayBuffer*/

(function (jIO, RSVP, DOMException, Blob, crypto, Uint8Array, ArrayBuffer) {
  "use strict";


  // you the cryptography system used by this storage is AES-GCM.
  // here is an example of how to generate a key to the json format.

  // var key,
  //     jsonKey;
  // crypto.subtle.generateKey({name: "AES-GCM",length: 256},
  //                           (true), ["encrypt", "decrypt"])
  // .then(function(res){key = res;});
  //
  // window.crypto.subtle.exportKey("jwk", key)
  // .then(function(res){jsonKey = val})
  //
  //var storage = jIO.createJIO({type: "crypt", key: jsonKey,
  //                             sub_storage: {...}});

  // find more informations about this cryptography system on
  // https://github.com/diafygi/webcrypto-examples#aes-gcm

  /**
   * The JIO Cryptography Storage extension
   *
   * @class CryptStorage
   * @constructor
   */

  var MIME_TYPE = "application/x-jio-aes-gcm-encryption";

  function CryptStorage(spec) {
    this._key = spec.key;
    this._jsonKey = true;
    this._sub_storage = jIO.createJIO(spec.sub_storage);
  }

  function convertKey(that) {
    return new RSVP.Queue()
      .push(function () {
        return crypto.subtle.importKey("jwk", that._key,
                                       "AES-GCM", false,
                                       ["encrypt", "decrypt"]);
      })
      .push(function (res) {
        that._key = res;
        that._jsonKey = false;
        return;
      });
  }

  CryptStorage.prototype.get = function () {
    return this._sub_storage.get.apply(this._sub_storage,
                                       arguments);
  };

  CryptStorage.prototype.post = function () {
    return this._sub_storage.post.apply(this._sub_storage,
                                        arguments);
  };

  CryptStorage.prototype.put = function () {
    return this._sub_storage.put.apply(this._sub_storage,
                                       arguments);
  };

  CryptStorage.prototype.remove = function () {
    return this._sub_storage.remove.apply(this._sub_storage,
                                          arguments);
  };

  CryptStorage.prototype.hasCapacity = function () {
    return this._sub_storage.hasCapacity.apply(this._sub_storage,
                                               arguments);
  };

  CryptStorage.prototype.buildQuery = function () {
    return this._sub_storage.buildQuery.apply(this._sub_storage,
                                              arguments);
  };


  CryptStorage.prototype.putAttachment = function (id, name, blob) {
    var initializaton_vector = crypto.getRandomValues(new Uint8Array(12)),
      that = this;

    return new RSVP.Queue()
      .push(function () {
        if (that._jsonKey === true) {
          return convertKey(that);
        }
        return;
      })
      .push(function () {
        return jIO.util.readBlobAsDataURL(blob);
      })
      .push(function (dataURL) {
        //string->arraybuffer
        var strLen = dataURL.currentTarget.result.length,
          buf = new ArrayBuffer(strLen),
          bufView = new Uint8Array(buf),
          i;

        dataURL = dataURL.currentTarget.result;
        for (i = 0; i < strLen; i += 1) {
          bufView[i] = dataURL.charCodeAt(i);
        }
        return crypto.subtle.encrypt({
          name : "AES-GCM",
          iv : initializaton_vector
        },
                                     that._key, buf);
      })
      .push(function (coded) {
        var blob = new Blob([initializaton_vector, coded], {type: MIME_TYPE});
        return that._sub_storage.putAttachment(id, name, blob);
      });
  };

  CryptStorage.prototype.getAttachment = function (id, name) {
    var that = this;

    return that._sub_storage.getAttachment(id, name)
      .push(function (blob) {
        if (blob.type !== MIME_TYPE) {
          return blob;
        }
        return new RSVP.Queue()
          .push(function () {
            if (that._jsonKey === true) {
              return convertKey(that);
            }
            return;
          })
          .push(function () {
            return jIO.util.readBlobAsArrayBuffer(blob);
          })
          .push(function (coded) {
            var initializaton_vector;

            coded = coded.currentTarget.result;
            initializaton_vector = new Uint8Array(coded.slice(0, 12));
            return new RSVP.Queue()
              .push(function () {
                return crypto.subtle.decrypt({
                  name : "AES-GCM",
                  iv : initializaton_vector
                },
                                             that._key, coded.slice(12));
              })
              .push(function (arr) {
                //arraybuffer->string
                arr = String.fromCharCode.apply(null, new Uint8Array(arr));
                return jIO.util.dataURItoBlob(arr);
              })
              .push(undefined, function (error) {
                if (error instanceof DOMException) {
                  return blob;
                }
                throw error;
              });
          });
      });
  };

  CryptStorage.prototype.removeAttachment = function () {
    return this._sub_storage.removeAttachment.apply(this._sub_storage,
                                                    arguments);
  };

  CryptStorage.prototype.allAttachments = function () {
    return this._sub_storage.allAttachments.apply(this._sub_storage,
                                                  arguments);
  };

  jIO.addStorage('crypt', CryptStorage);

}(jIO, RSVP, DOMException, Blob, crypto, Uint8Array, ArrayBuffer));
