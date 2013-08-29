/*jslint indent: 2, maxlen: 80, nomen : true */
/*global require */

(function () {
  "use strict";

  require.config({
    "paths": {
      "sha256":      "../src/sha256.amd",
      "jio":         "../jio",

      "test_util":   "jio/util",
      "fakestorage": "jio/fakestorage",

      "complex_queries":    "../complex_queries",
      "localstorage":       "../src/jio.storage/localstorage",
      "localstorage_tests": "jio.storage/localstorage.asynctests",

      "qunit":       "../lib/qunit/qunit",
      "sinon":       "../lib/sinon/sinon",
      "sinon_qunit": "../lib/sinon/sinon-qunit"
    },
    "shim": {
      "sinon":       ["qunit"],
      "sinon_qunit": ["sinon"]
    }
  });

  require([
    "sinon_qunit",
    "localstorage_tests"
  ]);
}());