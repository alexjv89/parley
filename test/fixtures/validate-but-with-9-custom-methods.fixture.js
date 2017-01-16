/**
 * Module dependencies
 */

var parley = require('../../');


/**
 * validate-but-with-9-custom-methods.fixture.js
 *
 * A simplified mock of a hypothetical `validate()` model method,
 * just like the other fixture (see `validate.fixture.js`) but with 9
 * distinct custom methods available on the Deferred instance.
 * (This is primarily for use in benchmarks.)
 *
 * @param {Function} explicitCbMaybe
 *
 * @returns {Deferred} If no callback specified
 */
module.exports = function validateButWith9CustomMethods(explicitCbMaybe){

  // If an explicit callback was specified, then go ahead
  // and proceed to where the real action is at.
  // Otherwise, no callback was specified explicitly,
  // so we'll build and return a Deferred instead.
  return parley(function (finalCb){

    // Now actually do stuff.
    // ...except actually don't-- this is just pretend.

    // All done.
    return finalCb();

  }, explicitCbMaybe, {
    a: function (beep, boop) { console.log(Math.random()+'hi0'); return this; },
    b: function (baa, baaa, black, sheep) { console.log(Math.random()+'hi1'); return this; },
    c: function (beep, boop) { console.log(Math.random()+'hi2'); return this; },
    d: function (baa, baaa, black, sheep) { console.log(Math.random()+'hi3'); return this; },
    e: function (beep, boop) { console.log(Math.random()+'hi5'); return this; },
    f: function (baa, baaa, black, sheep) { console.log(Math.random()+'hi5'); return this; },
    g: function (beep, boop) { console.log(Math.random()+'hi6'); return this; },
    h: function (baa, baaa, black, sheep) { console.log(Math.random()+'hi7'); return this; },
    i: function (beep, boop) { console.log(Math.random()+'hi8'); return this; },
  });

};

