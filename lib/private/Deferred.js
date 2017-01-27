/**
 * Module dependencies
 */

var assert = require('assert');
var _ = require('@sailshq/lodash');
var bluebird = require('bluebird');



/**
 * Deferred (constructor)
 *
 * The Deferred constructor is exported by this module (see bottom of file).
 *
 * ```
 * var deferred = new Deferred(function(done){
 *   // ...
 *   return done();
 * });
 * ```
 *
 * > Why use a constructor instead of just creating this object dynamically?
 * > This is purely for performance, since this is a rather hot code path.
 * > For details, see "OBSERVATIONS" in `tests/baseline.benchmark.js`.
 *
 * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
 * @param {Function} handleExec       [your function that should be run]
 *        @param {Function} done      [Node-style callback that your function should invoke when finished]
 *               @param {Error?} err
 *               @param {Ref?} resultMaybe
 * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
 * @constructs {Deferred}
 * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
 * @api private
 *      PLEASE DO NOT REQUIRE AND USE THIS CONSTRUCTOR EXCEPT WITHIN THIS PACKAGE!
 *      Instead, use `require('parley')` with the documented usage.  If you're
 *      trying to do this because you want to do an instanceof check, e.g. in
 *      a test, consider checking something like `_.isFunction(foo.exec)` and/or
 *      `foo.constructor.name === 'Deferred'`.
 * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
 */
function Deferred(handleExec){
  // assert(_.isFunction(handleExec), 'Should always provide a function as the 1st argument when constructing a `Deferred`');
  // assert.strictEqual(arguments.length, 1, 'Should always provide exactly 1 argument when constructing a `Deferred`');

  // Attach the provided `handleExec`function so it can be called from inside the
  // `.exec()` instance method below.
  // if (!_.isFunction(handleExec)){ throw new Error('Consistency violation: Expecting a function, but instead got: '+handleExec); }
  this._handleExec = handleExec;

  // Notes about our instance variables:
  //
  //  • We'll track the provided `handleExec` function as `this._handleExec`,
  //    so that we have a way to call it when the time comes. (See above.)
  //
  //  • We'll use `this._hasBegunExecuting` below to track whether we have
  //    begun executing this Deferred yet.  This is mainly for spinlocks.
  //
  //  • We'll use another instance variable below, `this._hasFinishedExecuting`,
  //    to track whether this Deferred has _finished_ yet.  This is mainly to
  //    improve error & warning messages.

  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // FUTURE: Investigate the performance impact of using Object.defineProperty()
  // for this and all other built-in instance variables (e.g. the spinlock-related
  // flags.)  Also maybe for things like `toString()` and `inspect()`.
  //
  // This is really just as a nicety.  The reason it was so slow before was likely
  // due to the fact that it got run on every invocation, whereas now (at least in
  // some cases, like for `inspect()`) it could be implemented so that it runs exactly
  // once per process.
  //
  // Why bother?  Just because it makes Deferred instances nicer to look at.
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

}




/**
 * .exec()
 *
 * @param  {Function} cb
 */
Deferred.prototype.exec = function(cb){

  // Since thar be closure scope below, a hazard for young `this`s, we define `self`.
  var self = this;

  if (_.isUndefined(cb)) {
    throw new Error(
      'No callback supplied. Please provide a callback function when calling .exec().  '+
      'See http://npmjs.com/package/parley for help.'
    );
  }//-•

  if (!_.isFunction(cb)) {
    throw new Error(
      'Sorry, `.exec()` doesn\'t know how to handle a callback like that:\n'+
      util.inspect(cb, {depth: 1})+'\n'+
      'Instead, please provide a callback function when calling .exec().  '+
      'See http://npmjs.com/package/parley for help.'
    );
  }//-•

  // Userland spinlock
  if (self._hasBegunExecuting) {
    console.warn(
      '\n'+
      'That\'s odd... It looks like this Deferred '+
      'has already '+(self._hasFinishedExecuting?'finished':'begun')+' executing.\n'+
      'But attempting to execute a Deferred more than once tends to cause\n'+
      'unexpected race conditions and other bugs!  So to be safe, rather than\n'+
      'executing it twice, the additional attempt was ignored automatically, and\n'+
      'this warning was logged instead.  See http://npmjs.com/package/parley for help.\n'+
      'Stack trace:\n'+
      '```\n'+
      ((new Error()).stack).replace(/^.+\n/, '')+
      '```\n'
    );
    return;
  }//-•
  self._hasBegunExecuting = true;

  // - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // FUTURE: implement configurable timeout here
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  try {
    self._handleExec(function (err, result) {

      // - - - - - - - - - - - - - - - - - - - - - - - - - - - -
      // FUTURE: Implementorland spinlock
      // e.g.
      // ```
      // if (self._hasFinishedExecuting) {
      //   console.warn(
      //     'Something seems to be wrong with this function.\n'+
      //     'It is trying to trigger your .exec() handler AGAIN...\n'+
      //     'after already calling it once.\n'+
      //     '(silently ignoring this...)'
      //   );
      //   return;
      // }
      // ```
      // - - - - - - - - - - - - - - - - - - - - - - - - - - - -

      if (err) {
        if (_.isError(err)) { /* ok */ }
        else if (_.isString(err)) { err = new Error(err); }
        else { err = new Error(util.inspect(err, {depth: 5})); }

        self._hasFinishedExecuting = true;
        return cb(err);
      }//-•

      self._hasFinishedExecuting = true;
      return cb(undefined, result);

    });
  } catch (e) {

    var err;
    if (_.isError(e)) { err = e; }
    else if (_.isString(e)) { err = new Error(e); }
    else { err = new Error(util.inspect(e, {depth: 5})); }

    self._hasFinishedExecuting = true;

    return cb(new Error(
      'Unexpected error was thrown while executing '+
      'this Deferred:\n'+
      '```\n'+
      err.stack+'\n'+
      '```\n'+
      'Also, here are the available keys on `self` at this point:\n'+
      '```\n'+
      _.keys(self)+'\n'+
      '```'
    ));

  }//</catch>
};

/**
 * .then()
 *
 * For usage, see:
 * http://bluebirdjs.com/docs/api/then.html
 */
Deferred.prototype.then = function (){
  var promise = this.toPromise();
  return promise.then.apply(promise, Array.prototype.slice.call(arguments));
};

/**
 * .catch()
 *
 * For usage, see:
 * http://bluebirdjs.com/docs/api/catch.html
 */
Deferred.prototype.catch = function (){
  var promise = this.toPromise();
  return promise.catch.apply(promise, Array.prototype.slice.call(arguments));
};

/**
 * .toPromise()
 *
 * Begin executing this Deferred and return a promise.
 *
 * > See also:
 * > http://bluebirdjs.com/docs/api/promisify.html
 *
 * @returns {Promise}
 */
Deferred.prototype.toPromise = function (){

  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // FUTURE: Use cached promise, if one has already been created
  // (potentially improves perf of `.catch()`)
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  // Build a function that, when called, will begin executing the underlying
  // logic and also return a promise.
  var getPromise = bluebird.promisify(this.exec, { context: this });
  // ^^This is equivalent to `bluebird.promisify(this.exec).bind(this)`
  // > The reason we have to use `.bind()` here is so that `.exec()` gets
  // > called w/ the appropriate context.  (If we were using closures instead
  // > of a prototypal thing, we wouldn't have to do this.)

  var promise = getPromise();
  return promise;

};


// Finally, export the Deferred constructor.
// (we could have done this earlier-- we just do it down here for consistency)
module.exports = Deferred;
