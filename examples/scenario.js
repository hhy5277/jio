/*global console, btoa, Blob*/
/*jslint nomen: true, maxlen: 200*/
(function (window, QUnit, jIO, rJS) {
  "use strict";
  var test = QUnit.test,
    equal = QUnit.equal,
    expect = QUnit.expect,
    ok = QUnit.ok,
    stop = QUnit.stop,
    start = QUnit.start,
    deepEqual = QUnit.deepEqual;

  rJS(window)

    .ready(function (g) {

      ///////////////////////////
      // Local storage
      ///////////////////////////
//       return g.run({
//         type: "query",
//         sub_storage: {
//           type: "uuid",
//           sub_storage: {
//             type: "document",
//             document_id: "/",
//             sub_storage: {
//               type: "zip",
//               sub_storage: {
//                 type: "local"
//               }
//             }
//           }
//         }
//       });

      ///////////////////////////
      // Memory storage
      ///////////////////////////
      return g.run({
        type: "query",
        sub_storage: {
          type: "uuid",
          sub_storage: {
            type: "union",
            storage_list: [{
              type: "memory"
            }]
          }
        }
      });

      ///////////////////////////
      // WebSQL storage
      ///////////////////////////
//      return g.run({
//        type: "query",
//        sub_storage: {
//          type: "uuid",
//          sub_storage: {
//            "type": "websql",
//            "database": "test"
//          }
//        }
//      });

      ///////////////////////////
      // IndexedDB storage
      ///////////////////////////
//       return g.run({
//         type: "query",
//         sub_storage: {
//           type: "uuid",
//           sub_storage: {
//             "type": "indexeddb",
//             "database": "test"
//           }
//         }
//       });

      ///////////////////////////
      // DAV storage
      ///////////////////////////
//       return g.run({
//         type: "query",
//         sub_storage: {
//           type: "uuid",
//           sub_storage: {
//             type: "drivetojiomapping",
//             sub_storage: {
//               "type": "dav",
//               "url": "DAVURL",
//               "basic_login": btoa("LOGIN:PASSWD")
//             }
//           }
//         }
//       });

      ///////////////////////////
      // Dropbox storage
      ///////////////////////////
//       return g.run({
//         type: "query",
//         sub_storage: {
//           type: "uuid",
//           sub_storage: {
//             type: "drivetojiomapping",
//             sub_storage: {
//               "type": "dropbox",
//               "access_token" : "TOKEN",
//               "root" : "dropbox"
//             }
//           }
//         }
//       });

      ///////////////////////////
      // Qiniu storage
      ///////////////////////////
//       return g.run({
//         type: "query",
//         sub_storage: {
//           type: "uuid",
//           sub_storage: {
//             "type": "qiniu",
//             "bucket": "BUCKET",
//             "access_key": "ACCESSKEY",
//             "secret_key": "SECRETKEY"
//           }
//         }
//       });

      ///////////////////////////
      // Replicate storage
      ///////////////////////////
//       return g.run({
//         type: "query",
//         sub_storage: {
//           type: "uuid",
//           sub_storage: {
//             type: "replicate",
//             local_sub_storage: {
//               type: "memory"
//             },
//             remote_sub_storage: {
//               "type": "memory"
//             }
//           }
//         }
//       });

      ///////////////////////////
      // Crypt storage
      ///////////////////////////
      // return g.run({
      //   type: "query",
      //   sub_storage: {
      //     type: "uuid",
      //     sub_storage: {
      //       type: "crypt",
      //       key: {"alg": "A256GCM", "ext": true,
      //             "k": "seeaLzpu8dHG07bO2ANH2GywbTqs_zrs4Vq8zmtYeE4",
      //             "key_ops": ["encrypt", "decrypt"], "kty": "oct"},
      //       sub_storage: {
      //         type: "indexeddb",
      //         database: "test427"
      //       }
      //     }
      //   }
      // });


    })
    .declareMethod('run', function (jio_options) {

      test('Test "' + jio_options.type + '"scenario', function () {
        var jio;
        stop();
        expect(14);

        try {
          jio = jIO.createJIO(jio_options);
        } catch (error) {
          console.error(error.stack);
          console.error(error);
          throw error;
        }

        // Try to fetch inexistent document
        jio.get("inexistent")
          .fail(function (error) {
            console.error(error);
            if (error.status_code !== 404) {
              throw error;
            }
            equal(error.status_code, 404, "404 if inexistent");

            // Post a document without ID
            return jio.post({"title": "I don't have ID éà&\n"});
          })
          .then(function (doc_id) {
            ok(doc_id, "Document without ID created (" + doc_id + ")");
            // Fetch the newly created document
            return RSVP.all([
              jio.get(doc_id),
              doc_id
            ]);
          })
          .then(function (result_list) {
            var doc = result_list[0],
              doc_id = result_list[1];
            deepEqual(doc, {"title": "I don't have ID éà&\n"},
                      "Document correctly fetched");
            // Remove the doc
            return jio.remove(doc_id);
          })
          .then(function (doc_id) {
            ok(doc_id, "Document removed");
            // Create some documents to check allDocs
            return RSVP.all([
              jio.put("id1", {"title": "1 ID", "int_index": 1}),
              jio.put("id2", {"title": "2 ID", "int_index": 2}),
              jio.put("id3", {"title": "3 ID", "int_index": 3})
            ]);
          })
          .then(function (all_doc_id) {
            equal(all_doc_id[0], "id1", "Document 1 correctly created");
            equal(all_doc_id[1], "id2", "Document 2 correctly created");
            equal(all_doc_id[2], "id3", "Document 3 correctly created");

//             // Default allDocs call
//             return jio.allDocs();
//           })
//           .then(function (result) {
//             deepEqual(result, {
//               data: {
//                 rows: [{
//                   id: "id1",
//                   value: {}
//                 }, {
//                   id: "id2",
//                   value: {}
//                 }, {
//                   id: "id3",
//                   value: {}
//                 }],
//                 total_rows: 3
//               }
//             }, "default allDocs OK");

            // Filter the result
            console.log("START ALLDOCS");
            return jio.allDocs({
              query: 'title: "2 ID"',
              select_list: ["int_index"]
            });
          })
          .then(function (result) {
            deepEqual(result, {
              data: {
                rows: [{
                  doc: {},
                  id: "id2",
                  value: {int_index: 2}
                }],
                total_rows: 1
              }
            }, "filter allDocs OK");

            // XXX Check include docs, sort, limit, select
          })

          .then(function () {
            return jio.getAttachment("inexistent", "enclosure")
              .fail(function (error) {
                equal(error.status_code, 404, "404 if inexistent");
                console.log(error);
              });
          })

          .then(function () {
            return jio.put("foo❤/test.txt", {});
          })

          .then(function () {
            return jio.putAttachment(
              "foo❤/test.txt",
              "enclosure",
              new Blob(["fooé\nbar测试四😈"], {type: "text/plain"})
            );
          })

          .then(function () {
            ok(true, "Attachment stored");
            return jio.getAttachment("foo❤/test.txt", "enclosure");
          })

          .then(function (blob) {
            return jIO.util.readBlobAsText(blob);
          })

          .then(function (result) {
            equal(result.target.result, "fooé\nbar测试四😈", "Attachment correctly fetched");
            return jio.get("foo❤/test.txt");

          })
          .then(function (doc) {
            deepEqual(doc, {}, "Document correctly fetched");

            return jio.allAttachments("foo❤/test.txt");
          })
          .then(function (doc) {
            deepEqual(doc, {
              enclosure: {}
            },
              "Attachment list correctly fetched");

            return jio.removeAttachment("foo❤/test.txt", "enclosure");
          })

          .then(function () {
            ok("Attachment removed");
          })

          .then(function () {
            return jio.repair();
          })

          .fail(function (error) {
            console.error("---");
            console.error(error.stack);
            console.error(error);
            ok(false, error);
          })
          .always(function () {
            start();
          });
      });
    });

}(window, QUnit, jIO, rJS));
