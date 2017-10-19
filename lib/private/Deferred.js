/**
 * Module dependencies
 */

// var assert = require('assert');
var util = require('util');
var _ = require('@sailshq/lodash');
var bluebird = require('bluebird');
var flaverr = require('flaverr');



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
 * @param  {Function} _cb
 *         The Node-style callback to invoke when the parley-wrapped implementation is finished.
 *
 * @param  {Function} handleUncaughtException
 *         If specified, this function will be used as a handler for uncaught exceptions
 *         thrown from within `_cb`. **But REMEMBER: this will not handle uncaught exceptions
 *         from any OTHER asynchronous callbacks which might happen to be used within `_cb`.**
 *         (It's the same sort of function you might pass into `.catch()`.)
 *         - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
 *         ^^FUTURE: deprecate, then remove support for this 2nd arg
 *         - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
 *
 * ------------------------------------------------------------------------------------------
 * Example usage:
 *
 * ```
 * User.create({ username: 'foo' }).exec(function (err, result) {
 *   if (err) {
 *     if (err.code === 'E_UNIQUE') { return res.badRequest('Username already in use.'); }
 *     else { return res.serverError(err); }
 *   }
 *
 *   return res.ok();
 *
 * }, res.serverError);
 * ```
 */
Deferred.prototype.exec = function(_cb, handleUncaughtException){

  // Since thar be closure scope below, a hazard for young `this`s, we define `self`.
  var self = this;


  if (_cb === undefined) {
    throw flaverr({
      name:
        'UsageError',
      message:
        'No callback supplied. Please provide a callback function when calling .exec().\n'+
        ' [?] See https://sailsjs.com/support for help.'
    }, self._omen);
  }//-•

  if (!_.isFunction(_cb)) {
    if (!_.isArray(_cb) && _.isObject(_cb)) {
      throw flaverr({
        name:
          'UsageError',
        message:
          'Sorry, `.exec()` doesn\'t know how to handle {...} callbacks.\n'+
          'Please provide a callback function when calling .exec().\n'+
          '|  If you passed in {...} on purpose as a "switchback" (dictionary of callbacks),\n'+
          '|  then try calling .switch() intead of .exec().\n'+
          ' [?] See https://sailsjs.com/support for more help.'
      }, self._omen);
    }
    else {
      throw flaverr({
        name:
          'UsageError',
        message:
          'Sorry, `.exec()` doesn\'t know how to handle a callback like that:\n'+
          util.inspect(_cb, {depth: 1})+'\n'+
          '\n'+
          'Instead, please provide a callback function when calling .exec().\n'+
          ' [?] See https://sailsjs.com/support for help.'
      }, self._omen);
    }
  }//-•

  // Check usage of 2nd argument to .exec().
  if (handleUncaughtException !== undefined) {
    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
    // FUTURE: Consider adding a deprecation notice to this behavior, and then remove support
    // altogether.  (This isn't really as necessary anymore now that ES8 async/await is widely
    // available on the server, and should be available in the browser... soonish?)
    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
    if (!_.isFunction(handleUncaughtException)) {
      throw flaverr({
        message:
          'Sorry, `.exec()` doesn\'t know how to handle an uncaught exception handler like that:\n'+
          util.inspect(handleUncaughtException, {depth: 1})+'\n'+
          'If provided, the 2nd argument to .exec() should be a function like `function(err){...}`\n'+
          '(This function will be used as a failsafe in case the callback throws an uncaught error.)\n'+
          ' [?] See https://sailsjs.com/support for help.'
      }, self._omen);
    }//•

    // Impose arbitrary restriction against an unsupported edge case.
    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
    // FUTURE: maybe remove this restriction.  But also... might not even be relevant, since
    // we'll probably get rid of support for this usage (see above)
    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
    if (self._finalAfterExecLC){
      throw new Error('Consistency violation:  Currently, the 2nd argument to .exec() may not be used, since this Deferred was built with a custom `interceptAfterExec` handler.  Please avoid using the 2nd argument to .exec() and use ES8 async/await instead, if possible.');
    }//•

  }//ﬁ



  // This variable (`cb`) is used as our callback.  In the next few lines, we determine
  // what it will be.  This is just a potentially-more-efficient alternative to a series
  // of self-calling functions,  We only do this to afford better performance in the general case.
  //
  // > (Normally, this sort of micro-optimization wouldn't matter, but this is an extradordinarily
  // > hot code path.  Note that if we can prove self-calling functions are just as good, or even
  // > good enough, it would be preferable to use them instead (not only for consistency, but
  // > certainly for clarity as well).)
  var cb;


  // To begin with, no matter what, intercept `_cb` by wrapping it in another function
  // (a new one that we'll call `cb`) which adds some additional checks.
  //
  // > Note that we don't use .slice() on the `arguments` keyword -- this is for perf.
  // > (see https://github.com/petkaantonov/bluebird/wiki/Optimization-killers#what-is-safe-arguments-usage)
  cb = function _tryToRunCb(/*…*/) {


    // If this Deferred was built with an `interceptAfterExec` lifecycle callback,
    // then intercept our normal flow to call that lifecycle callback, picking up
    // the potentially-changed (even potentially-reconstructed!) error or result.
    if (self._finalAfterExecLC) {
      if (arguments[0]) {
        arguments[0] = self._finalAfterExecLC(arguments[0]);
      }
      else {
        arguments[1] = self._finalAfterExecLC(undefined, arguments[1]);
      }
    }//ﬁ

    // If this callback is being called after at least one tick has elapsed...
    if (self._hasAlreadyWaitedAtLeastOneTick) {

      // If 2nd argument (handleUncaughtException) was provided to .exec(), then run that
      // instead of throwing.  This protects against unexpected, uncaught exceptions in
      // asynchronous callbacks.
      // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
      // FUTURE: Probably deprecate this, then remove support (see above).
      // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
      if (handleUncaughtException) {
        try {
          return _cb.apply(undefined, arguments);
        } catch (unexpectedErrorFromCallback) {
          return handleUncaughtException(unexpectedErrorFromCallback);
        }
      }//•

      // Otherwise, just trigger the callback as-is.
      // (If it throws, it will crash the process!)
      return _cb.apply(undefined, arguments);

    }//•
    //‡
    // Otherwise, our logic is synchronous (i.e. <1 async tick has elapsed at the time it's being
    // called).  So wrap the `_cb` from userland in a try/catch.  If an unhandled error of any kind
    // is thrown from the userland cb, our wrapper uses a special Envelope to bust out of the `try`
    // block, ensuring that the unhandled exception is thrown up to userland.
    //
    // > NOTE:
    // > Without this extra code here, we'd end up with the old behavior: outputting a puzzling error
    // > message -- e.g. about something unexpected things happening in the Deferred, or a warning
    // > about triggering the callback twice (when actually, the issue is that something went wrong
    // > in the callback-- and that the Deferred logic happened to be synchronous, so it wasn't able
    // > to escape parley's internal `try` block.)
    // >
    // > Some relevant links for reference:
    // > • https://github.com/node-machine/machine/blob/7fdcf8a869605d0951909725061379cd27bd7f0d/lib/private/intercept-exit-callbacks.js#L186-L238
    // > • https://github.com/node-machine/machine/search?utf8=%E2%9C%93&q=_hasFnYieldedYet&type=
    // > • https://github.com/node-machine/machine/search?utf8=%E2%9C%93&q=_runningSynchronously&type=
    else {
      try {
        return _cb.apply(undefined, arguments);
      } catch (unexpectedErrorFromCallback) {
        throw flaverr({
          name: 'Envelope',
          code: 'E_ESCAPE_HATCH',
          traceRef: self,
          raw: unexpectedErrorFromCallback
        });
      }
    }//•

    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
    // FUTURE: Additionally, this additional layer of wrapping could take care of improving
    // stack traces, even in the case where an Error comes up from inside the implementation.
    // If done carefully, this can be done in a way that protects characteristics of the
    // internal Error (e.g. its "code", etc.), while also providing a better stack trace.
    //
    // For example, something like this:
    // ```
    // var relevantPropNames = _.difference(
    //   _.union(
    //     ['name', 'message'],
    //     Object.getOwnPropertyNames(underlyingError)
    //   ),
    //   ['stack']
    // );
    // var errTemplate = _.pick(underlyingError, relevantPropNames);
    // errTemplate.raw = underlyingError;//<< could override stuff-- that's ok (see below).
    // var newError = flaverr(errTemplate, omen);
    // ```
    // > Note that, above, we also kept the original error (and thus _its_ trace) and
    // > attached that as a separate property.  If the original error already has "raw",
    // > that's ok.  This is one thing that it makes sense for us to mutate-- and any
    // > attempt to do otherwise would probably be more confusing (you can imagine a while
    // > loop where we add underscores in front of the string "raw", and use that as a keyname.
    // > But again, that ends up being more confusing from a userland perspective.)
    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  };//ƒ





  // Userland spinlock
  if (self._hasBegunExecuting) {
    console.warn(
      '\n'+
      'That\'s odd... It looks like this Deferred '+
      'has already '+(self._hasTimedOut?'timed out':self._hasFinishedExecuting?'finished executing':'begun executing')+'.\n'+
      'But attempting to execute a Deferred more than once tends to cause\n'+
      'unexpected race conditions and other bugs!  So to be safe, rather than\n'+
      'executing it twice, the additional attempt was ignored automatically, and\n'+
      'this warning was logged instead.  [?] See https://sailsjs.com/support for help.\n'+
      '\n'+
      'Stack trace:\n'+
      '```\n'+
      flaverr.getBareTrace(self._omen)+'\n'+
      '```\n'
    );
    return;
  }//-•
  self._hasBegunExecuting = true;

  // Before proceeding to execute the function, set up a `setTimeout` that will fire
  // when the runtime duration exceeds the configured timeout.
  // > If configured timeout is falsey or <0, then we ignore it.
  // > Also note that we include a worst-case-scenario spinlock here (but it should never fire!)
  var timeoutAlarm;
  if (self._timeout && self._timeout > 0) {
    timeoutAlarm = setTimeout(function(){
      if (self._hasFinishedExecuting) {
        console.warn(
          'WARNING: Consistency violation: Trying to trigger timeout, but after execution is\n'+
          'has already finished!  This should not be possible, and the fact that you\'re seeing\n'+
          'this message indicates that there is probably a bug somewhere in the tools -- or\n'+
          'possibly that this Deferred instance has been mutated by userland code.\n'+
          'Please report this at https://sailsjs.com/bugs or https://sailsjs.com/support.\n'+
          '(silently ignoring it this time...)\n'+
          '\n'+
          'Stack trace:\n'+
          '```\n'+
          flaverr.getBareTrace(self._omen)+'\n'+
          '```\n'
        );
        return;
      }
      if (self._hasTimedOut) {
        console.warn(
          'WARNING: Consistency violation: Trying to trigger timeout again, after it has already\n'+
          'been triggered!  This should not be possible, and the fact that you\'re seeing\n'+
          'this message indicates that there is probably a bug somewhere in the tools -- or\n'+
          'possibly that this Deferred instance has been mutated by userland code.\n'+
          'Please report this at https://sailsjs.com/bugs or https://sailsjs.com/support.\n'+
          '(silently ignoring it this time...)\n'+
          '\n'+
          'Stack trace:\n'+
          '```\n'+
          flaverr.getBareTrace(self._omen)+'\n'+
          '```\n'
        );
        return;
      }
      self._hasTimedOut = true;
      var err = flaverr({
        name:
          'TimeoutError',
        message:
          'Took too long to finish executing (timeout of '+self._timeout+'ms exceeded.)\n'+
          'There is probably an issue in the implementation (might have forgotten to call `exits.success()`, etc.)\n'+
          'If you are the implementor of the relevant logic, and you\'re sure there are no problems, then you\'ll\n'+
          'want to (re)configure the timeout (maximum number of milliseconds to wait for the asynchronous logic to\n'+
          'finish).  Otherwise, you can set the timeout to 0 to disable it.\n'+
          ' [?] See https://sailsjs.com/support for help.'
      }, self._omen);
      return cb(err);

    }, self._timeout);// _∏_   (invoking `setTimeout()`)
  }//>-


  // Trigger the executioner function.
  // > Note that we always wrap the executioner in a `try` block to prevent common issues from
  // > uncaught exceptions, at least within the tick.
  try {

    self._handleExec(function (err, result) {

      // Implementorland spinlock
      if (self._hasFinishedExecuting && !self._skipImplSpinlockWarning) {
        console.warn(
          '- - - - - - - - - - - - - - - - - - - - - - - - - - - - - -\n'+
          'WARNING: Something seems to be wrong with this function.\n'+
          'It is trying to signal that it has finished AGAIN, after\n'+
          'already resolving/rejecting once.\n'+
          '(silently ignoring this...)\n'+
          '\n'+
          'To assist you in hunting this down, here is a stack trace:\n'+
          '```\n'+
          flaverr.getBareTrace(self._omen)+'\n'+
          '```\n'+
          '\n'+
          ' [?] For more help, visit https://sailsjs.com/support\n'+
          '- - - - - - - - - - - - - - - - - - - - - - - - - - - - - -'
        );
        return;
      }

      // If the deferred has already timed out, then there's no need to warn
      // (This was _bound_ to happen beings as how we timed out.)
      //
      // > Note that we still set a flag to track that this happened.  This is to make sure
      // > this if/then statement can't possibly be true more than once (because that would
      // > definitely still be unexpected-- and really hard to anticipate / debug if it were
      // > to happen to you)
      if (self._hasTimedOut) {
        self._hasFinishedExecuting = true;
        return;
      }

      // Clear timeout, if relevant.
      if (timeoutAlarm) {
        clearTimeout(timeoutAlarm);
      }


      if (err) {
        // Ensure we're dealing w/ an Error instance.
        // > Note that async+await/bluebird/Node 8 errors are not necessarily "true" Error instances,
        // > as per _.isError() anyway (see https://github.com/node-machine/machine/commits/6b9d9590794e33307df1f7ba91e328dd236446a9).
        // > So if we want to keep a reasonable stack trace, we have to be a bit more relaxed here and
        // > tolerate these sorts of "errors" directly as well (by tweezing out the `cause`, which is
        // > where the original Error lives.)
        if (_.isError(err)) { /* ok */ }
        else if (_.isObject(err) && err.cause && _.isError(err.cause)) { err = err.cause; }
        else if (_.isString(err)) { err = flaverr({ message: err, raw: err }, self._omen); }
        else { err = flaverr({ message: util.inspect(err, {depth: 5}), raw: err }, self._omen); }
        // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
        // ^ FUTURE: Better error message for this fourth case?
        // (see the `exits.error` impl in the machine runner for comparison,
        // and be sure to try any changes out by hand to experience the message
        // before deciding.  It's definitely not cut and dry whether there should
        // even be a custom message in this case, or if just displaying the output
        // as the `message` -- like we currently do -- is more appropriate)
        // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

        self._hasFinishedExecuting = true;

        return cb(err);

      }//-•


      // IWMIH, there was no error.
      self._hasFinishedExecuting = true;

      // If there are any extra arguments, send them back too.
      // (This is unconventional, but permitted to allow for extra metadata,
      // which is sometimes handy when you want to expose advanced usage.)
      if (arguments.length > 2) {
        // > Note that we don't use .slice() -- this is for perf.
        // > (see https://github.com/petkaantonov/bluebird/wiki/Optimization-killers#what-is-safe-arguments-usage)
        return cb.apply(undefined, arguments);
      }
      // Otherwise, this is the normal case.
      // If there's no result, just call the callback w/ no args.
      // (This just makes for better log output, etc.)
      else if (result === undefined) {
        return cb();
      }
      // Otherwise, there's a result, so send it back.
      else {
        return cb(undefined, result);
      }

    });//</self._handleExec>

  // Handle errors thrown synchronously by the `_handleExec` implementation:
  } catch (e) {

    // Check to make sure this error isn't a special "escape hatch" from
    // the edge case where an error was thrown from within the userland callback
    // provided to .exec() -- specifically in the case where the handleExec logic
    // is synchronous (i.e. non-blocking- triggering its `done` within 1 tick.)
    if (e.name === 'Envelope' && e.code === 'E_ESCAPE_HATCH' && e.traceRef === self) {
      throw e.raw;
    }//•

    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
    // NOTE: The following code is ALMOST exactly the same as the code above.
    // It's duplicated in place rather than extrapolating purely for performance,
    // and since the error messages vary a bit:
    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
    if (self._hasFinishedExecuting) {
      console.warn(
        '- - - - - - - - - - - - - - - - - - - - - - - - - - - - - -\n'+
        'WARNING: Something seems to be wrong with this function.\n'+
        'It threw an unhandled error during the first tick of its\n'+
        'execution... but before doing so, it somehow managed to\n'+
        'have already resolved/rejected once.\n'+
        '(silently ignoring this...)\n'+
        '\n'+
        'To assist you in hunting this down, here is a stack trace:\n'+
        '```\n'+
        flaverr.getBareTrace(self._omen)+'\n'+
        '```\n'+
        '\n'+
        ' [?] For more help, visit https://sailsjs.com/support\n'+
        '- - - - - - - - - - - - - - - - - - - - - - - - - - - - - -'
      );
      return;
    }//-•

    if (self._hasTimedOut) {
      console.warn(
        'WARNING: Consistency violation: This function threw an unhandled error during the\n'+
        'first tick of its execution... but before doing so, it somehow managed to\n'+
        'have already triggered the timeout.  This should not be possible, and the fact that\n'+
        'you\'re seeing this message indicates that there is probably a bug somewhere in the\n'+
        'tools -- or possibly that this Deferred instance has been mutated by userland code.\n'+
        'Please report this at https://sailsjs.com/bugs or https://sailsjs.com/support.\n'+
        '(silently ignoring it this time...)\n'+
        '\n'+
        'To assist you in hunting this down, here is a stack trace:\n'+
        '```\n'+
        flaverr.getBareTrace(self._omen)+'\n'+
        '```\n'
      );
      self._hasFinishedExecuting = true;
      return;
    }//-•

    if (timeoutAlarm) {
      clearTimeout(timeoutAlarm);
    }//>-

    var err;
    if (_.isError(e)) { err = e; }
    else if (_.isObject(e) && e.cause && _.isError(e.cause)) { err = e.cause; } //<< see above for more info
    else if (_.isString(e)) { err = flaverr({ message: e, raw: e }, self._omen); }
    else { err = flaverr({ message: util.inspect(e, {depth: 5}), raw: e }, self._omen); }
    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
    // ^ FUTURE: Better error message for this fourth case?
    // (see the `exits.error` impl in the machine runner for comparison,
    // and be sure to try any changes out by hand to experience the message
    // before deciding.  It's definitely not cut and dry whether there should
    // even be a custom message in this case, or if just displaying the output
    // as the `message` -- like we currently do -- is more appropriate)
    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

    self._hasFinishedExecuting = true;

    return cb(err);
    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
    // FUTURE: Consider using the more detailed explanation for ALL 4 (!!) of the above cases
    // (and use omens for them too -- even the Error instances!)
    // > see other "FUTURE" block above to read about the other stuff we'd want to do first--
    // > and also note that we'd almost certainly want to leave out the bit about "available
    // > keys on `self`" bit (that's really just leftover from debugging)
    // ```
    //    return cb(flaverr({
    //      message:
    //        'Unexpected error was thrown while executing '+
    //        'this Deferred:\n'+
    //        '```\n'+
    //        flaverr.getBareTrace(self._omen)+'\n'+
    //        '```\n'+
    //        'Also, here are the available keys on `self` at this point:\n'+
    //        '```\n'+
    //        _.keys(self)+'\n'+
    //        '```'
    //    }, self._omen));
    // ```
    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  }//</catch>

  // Use `self._hasAlreadyWaitedAtLeastOneTick` to track whether or not this logic is asynchronous.
  if (self._hasFinishedExecuting) {
    // IWMIH and we've already finished running `handleExec`, then we know
    // it must have been composed purely of blocking (i.e. synchronous) logic.
    self._hasAlreadyWaitedAtLeastOneTick = false;
  }
  else {
    // Otherwise, IWMIH we know that the callback hasn't been called yet-- meaning
    // that we're likely dealing with some non-blocking (i.e. asynchronous) logic.
    // (Or possibly a bug where the callback isn't getting called -_-)
    self._hasAlreadyWaitedAtLeastOneTick = true;
  }


};

/**
 * .then()
 *
 * For usage, see:
 * http://bluebirdjs.com/docs/api/then.html
 */
Deferred.prototype.then = function (){
  var promise = this.toPromise();
  // > Note that we don't use .slice() -- this is for perf.
  // > (see https://github.com/petkaantonov/bluebird/wiki/Optimization-killers#what-is-safe-arguments-usage)
  return promise.then.apply(promise, arguments);
};

/**
 * .catch()
 *
 * For usage, see:
 * http://bluebirdjs.com/docs/api/catch.html
 */
Deferred.prototype.catch = function (){
  var promise = this.toPromise();
  return promise.catch.apply(promise, arguments);

  // Note: While the following is all very nice, we would need to change `Promise.prototype` to
  // have it be universally useful.  So to avoid that can of worms, leaving this commented out,
  // and the above commented _in_.  (See the "FUTURE" note just below here for more thoughts about
  // a better solution that would allow for mixing Deferred syntax for error handling with standard
  // ES8 async/await)
  // ================================================================================================
  // Deferred.prototype.catch = function (_handlerOrEligibilityFilter, _handlerMaybe){
  // // Start running the logic and get a promise.
  // var promise = this.toPromise();
  //
  // // If first argument is string, then we'll assume that the 2nd argument must be a function,
  // // and that the intent was to understand this as:
  // // ```
  // // .catch({ code: theFirstArgument }, handler);
  // // ```
  // // > Note that this behavior is an **EXTENSION OF BLUEBIRD!**
  // // > Thus it is not supported outside of parley, and it is a deliberate divergence
  // // > in order to more closely match the one-step-simpler interface exposed by tools
  // // > like `flaverr`.
  // if (_.isString(_handlerOrEligibilityFilter)) {
  //   if (!_handlerMaybe) {
  //     throw flaverr({
  //       name:
  //         'UsageError',
  //       message:
  //         'Invalid usage of `.catch()`.  If the first argument to .catch() is NOT a function,\n'+
  //         'then a handler function should always be passed in as the second argument.\n'+
  //         'See https://sailsjs.com/support for help.'
  //     }, this._omen);
  //   }
  //   return promise.catch.apply(promise, [{ code: _handlerOrEligibilityFilter }, _handlerMaybe]);
  // }
  // // Otherwise, if a second argument of some kind was supplied, we'll assume it's
  // // our handler function, and that the first argument must be a valid eligibility
  // // filter.
  // else if (_handlerMaybe) {
  //   return promise.catch.apply(promise, [_handlerOrEligibilityFilter, _handlerMaybe]);
  // }
  // // Otherwise, since there's no second argument, there must not be an eligibility filter.
  // // So we'll treat the first argument as our handler.
  // else {
  //   return promise.catch.apply(promise, [_handlerOrEligibilityFilter]);
  // }
  // ================================================================================================

};









/**
 * bindAfterExecLC()
 *
 * Shared by .intercept() and .tolerate().
 *
 * @param  {String} lcType                           [description]
 * @param  {String|Dictionary|Function} negotiationRuleOrWildcardHandler [description]
 * @param  {Function?} specificHandler                  [description]
 * @param  {Deferred} deferred                         [description]
 *
 *
 * > The lifecycle callback attached here will run *before* this Deferred's
 * > `interceptAfterExec` function (if it has one configured from implementorland.)
 * >
 * > Historical notes:
 * > https://gist.github.com/mikermcneil/c1bc2d57f5bedae810295e5ed8c5f935
 */
function bindAfterExecLC(lcType, negotiationRuleOrWildcardHandler, specificHandler, deferred){

  // Handle variadic usage.
  var handler;
  var negotiationRule;
  if (_.isFunction(negotiationRuleOrWildcardHandler) && specificHandler === undefined) {
    handler = negotiationRuleOrWildcardHandler;
  }
  else {
    negotiationRule = negotiationRuleOrWildcardHandler;
    handler = specificHandler;
  }

  // Validate arguments.
  if (handler !== undefined && !_.isFunction(handler)) {
    throw flaverr({
      name:
        'UsageError',
      message:
        'Invalid usage of `.'+lcType+'()`.  Provided handler function is invalid.\n'+
        ' [?] See https://sailsjs.com/support for help.'
    }, deferred._omen);
  }//•

  if (handler === undefined && lcType === 'intercept') {
    throw flaverr({
      name:
        'UsageError',
      message:
        'Invalid usage of `.intercept()`.  No handler function provided.\n'+
        ' [?] See https://sailsjs.com/support for help.'
    }, deferred._omen);
  }//•


  if (negotiationRule !== undefined) {

    if (_.isString(negotiationRule) && negotiationRule) {
      // Ok, we'll assume it's fine.
    }
    else if (_.isObject(negotiationRule) && !_.isArray(negotiationRule) && !_.isFunction(negotiationRule)) {
      // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
      // TODO: add support for flaverr/bluebird/lodash-style dictionary negotiation rules
      // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
    }
    else {
      throw flaverr({
        name:
          'UsageError',
        message:
          'Invalid usage of `.'+lcType+'()`.  Invalid error negotiation rule: `'+negotiationRule+'`.\n'+
          ' [?] See https://sailsjs.com/support for help.'
      }, deferred._omen);
    }

  }//ﬁ


  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // FUTURE: MAYBE add a best-effort check to make sure there is no pre-existing
  // after exec LC rule that matches this one (i.e. already previously registered
  // using .tolerate() or .intercept())
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  deferred._userlandAfterExecLCs = deferred._userlandAfterExecLCs || [];
  deferred._userlandAfterExecLCs.push({
    type: lcType,
    rule: negotiationRule,
    handler: handler
  });

  // TODO: move this logic into the place where LCs get run:
  // handler: handler?
  //   handler
  //   :
  //   function(){ return; }


  return deferred;
};


/**
 * .intercept()
 *
 * Bind a special after-exec lifecycle callback that is useful for easily catching+rethrowing
 * errors, without the risk of unintentionally swallowing unrelated bugs by using other
 * mechanisms (e.g. try/catch blocks)
 *
 * > See `bindAfterExecLC` utility for details on how this works.
 */
Deferred.prototype.intercept = function(negotiationRuleOrWildcardHandler, specificHandler){
  bindAfterExecLC('intercept', negotiationRuleOrWildcardHandler, specificHandler, this);
  return this;
};


/**
 * .tolerate()
 *
 * Bind a special after-exec lifecycle callback that is useful for gracefully handling
 * particular errors without accidentally swallowing unrelated bugs by using other mechanisms
 * (e.g. try/catch blocks).
 *
 * > See `bindAfterExecLC` utility for details on how this works.
 */
Deferred.prototype.tolerate = function(negotiationRuleOrWildcardHandler, specificHandler){
  bindAfterExecLC('tolerate', negotiationRuleOrWildcardHandler, specificHandler, this);
  return this;
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

  // Use cached promise, if one has already been created.
  //
  // > This prevents extraneous invocation in `.then()` chains.
  // > (& potentially improves perf of `.catch()`)
  if (this._promise) {
    return this._promise;
  }//-•

  // Build a function that, when called, will begin executing the underlying
  // logic and also return a promise.
  var getPromise = bluebird.promisify(this.exec, { context: this });
  // ^^This is equivalent to `bluebird.promisify(this.exec).bind(this)`
  // > The reason we have to use `.bind()` here is so that `.exec()` gets
  // > called w/ the appropriate context.  (If we were using closures instead
  // > of a prototypal thing, we wouldn't have to do this.)

  // Make a promise, and cache it as `this._promise` so that it can be
  // reused (e.g. in case there are multiple calls to `.then()` and `.catch()`)
  this._promise = getPromise();
  return this._promise;

};


/**
 * .now()
 *
 * Execute the Deferred and get an immediate result.
 * (Only works for synchronous logic.)
 *
 * @returns {Ref} result from invoking the `handleExec` function
 * @throws {Error} If something goes wrong with the `handleExec` logic
 */
Deferred.prototype.now = function () {

  var isFinishedExecuting;
  var immediateResult;
  var immediateError;
  this.exec(function (err, result){
    isFinishedExecuting = true;
    immediateError = err;
    immediateResult = result;
  });//_∏_

  if (!isFinishedExecuting) {

    this._skipImplSpinlockWarning = true;
    // ^^This indicates that this Deferred should now silently ignore any
    // extra attempts to trigger its callbacks- whether that's from within
    // the custom implementation or from something more built-in (e.g. the
    // timeout) -- i.e. because we've already sent back a proper error,
    // and the extra warnings just muddy the waters, so to speak- making
    // it harder to tell what the actual problem was.

    throw flaverr({
      name:
        'UsageError',
      code:
        'E_NOT_SYNCHRONOUS',
      message:
        'Failed to call this function synchronously with `.now()` because\n'+
        'it is not actually synchronous.  Rather than `.now()`, please use `await` or `.exec()`.',
      traceRef: this
    }, this._omen);

  }//•

  if (immediateError) {
    throw immediateError;
  }//•

  return immediateResult;
};


/**
 * .log()
 *
 * Log the output from this asynchronous logic, fully-expanded.
 * (Uses `util.inspect(..., {depth: null})`.)
 *
 * * * * WARNING: THIS METHOD IS EXPERIMENTAL! * * *
 *
 * Note: This is for debugging / for exploration purposes, especially
 * for use on the Node.js/Sails.js REPL or in the browser console.
 * If there is an error, it will simply be logged to stderr.
 */
Deferred.prototype.log = function (){


  if (process.env.NODE_ENV === 'production') {
    console.warn('* * * * * * * * * * * * * * * * * * * * * * * * * *');
    console.warn('Warning: Production environment detected...');
    console.warn('Please reconsider using using .log() in production.');
    console.warn('(Visit https://sailsjs.com/support for help.)');
    console.warn('* * * * * * * * * * * * * * * * * * * * * * * * * *');
  }
  else {
    console.log('Running with `.log()`...');
  }

  this.exec(function(err, result) {
    if (err) {
      console.error();
      console.error('- - - - - - - - - - - - - - - - - - - - - - - -');
      console.error('An error occurred:');
      console.error();
      console.error(err);
      console.error('- - - - - - - - - - - - - - - - - - - - - - - -');
      console.error();
      return;
    }//-•

    console.log();
    if (result === undefined) {
      console.log('- - - - - - - - - - - - - - - - - - - - - - - -');
      console.log('Finished successfully.');
      console.log();
      console.log('(There was no result.)');
      console.log('- - - - - - - - - - - - - - - - - - - - - - - -');
    }
    else {
      console.log('- - - - - - - - - - - - - - - - - - - - - - - -');
      console.log('Finished successfully.');
      console.log();
      console.log('Result:');
      console.log();
      console.log(util.inspect(result, {depth:null}));
      console.log('- - - - - - - - - - - - - - - - - - - - - - - -');
    }
    console.log();

  });

};


// Attach `inspect`, `toString`, and `toJSON` functions
// (This is mainly to hide the `_omen` property, which is pretty scary-looking)
Deferred.prototype.toJSON = function (){ return null; };
Deferred.prototype.toString = function (){ return '[Deferred]'; };
Deferred.prototype.inspect = function (){ return '[Deferred]'; };



// Finally, export the Deferred constructor.
// (we could have done this earlier-- we just do it down here for consistency)
module.exports = Deferred;
