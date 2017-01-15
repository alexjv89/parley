/**
 * Module dependencies
 */

var util = require('util');
var _ = require('@sailshq/lodash');
var bluebird = require('bluebird');
var Deferred = require('./private/Deferred');



/**
 * parley()
 *
 * Build a deferred object that supports Node-style callbacks and promises.
 * > See README.md for more details.
 * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
 * @param {Function} handleExec
 *        The `handleExec` function to call (either immediately or when the Deferred
 *        is executed, depending on whether an explicit cb was provided)
 *
 * @param {Function?} explicitCbMaybe
 *        An optional parameter that, if specified, is passed directly as the incoming
 *        `done` argument to your "handleExec" handler function (i.e. _its_ callback).
 *        Otherwise, if it is omitted, then handleExec receives an internally-generated
 *        callback (from parley) as its `done` argument.  When called, this implicit `done`
 *        will appropriately dispatch with the deferred object.  Finally, note that if an
 *        explicit callback is provided, parley will return undefined instead of returning
 *        a Deferred.
 *        > The nice thing about this is that it allows implementor code that provide this
 *        > feature to avoid manually duplicating the branching logic (i.e. the code that
 *        > checks to see if an explicit cb was provided, and if not, returns a new Deferred)
 * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
 * @returns {Deferred}
 * @throws {Error} If there are unexpected usage problems with how parley() itself is called
 */

module.exports = function parley(handleExec, explicitCbMaybe){

  // Set up a local variable to track whether we have begun executing this Deferred yet.
  // (this is used below to implement a spinlock)
  var hasBegunExecuting;

  // Set up another variable to track whether this has _finished_ yet.
  // (this is used below to improve error & warning messages)
  var hasFinishedExecuting;

  // A few (very carefully picked) sanity checks for implementors.
  //
  // > Note that we deliberately use `typeof` instead of _.isFunction() for performance.
  if (!handleExec) {
    throw new Error('Consistency violation: Must specify a first argument when calling parley() -- please provide a `handleExec` function or a dictionary of options');
  }
  if (typeof handleExec !== 'function') {
    throw new Error('Consistency violation: First argument to parley() should be a function.  But instead, got: '+util.inspect(handleExec, {depth:2})+'');
  }

  //==========================================================================================
  // ALL OTHER **IMPLEMENTOR** USAGE CHECKS WERE REMOVED FOR PERFORMANCE REASONS.
  //
  // > Check out this commit for the original code:
  // > https://github.com/mikermcneil/parley/commit/e7ec7e445e2a502b9fcb57bc746c7b9714d3cf16)
  // >
  // > Also note we still do a few (very carefully picked) validations for things that could
  // > affect end users of parley-implementing functions -- i.e. code that calls .exec(), etc.
  // > That's all handled elsewhere (where the exec() method is defined.)
  //==========================================================================================



  //  ██╗  ██╗ █████╗ ███╗   ██╗██████╗ ██╗     ███████╗
  //  ██║  ██║██╔══██╗████╗  ██║██╔══██╗██║     ██╔════╝
  //  ███████║███████║██╔██╗ ██║██║  ██║██║     █████╗
  //  ██╔══██║██╔══██║██║╚██╗██║██║  ██║██║     ██╔══╝
  //  ██║  ██║██║  ██║██║ ╚████║██████╔╝███████╗███████╗
  //  ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝╚═════╝ ╚══════╝╚══════╝
  //
  //  ███████╗██╗  ██╗██████╗ ██╗     ██╗ ██████╗██╗████████╗     ██████╗██████╗
  //  ██╔════╝╚██╗██╔╝██╔══██╗██║     ██║██╔════╝██║╚══██╔══╝    ██╔════╝██╔══██╗
  //  █████╗   ╚███╔╝ ██████╔╝██║     ██║██║     ██║   ██║       ██║     ██████╔╝
  //  ██╔══╝   ██╔██╗ ██╔═══╝ ██║     ██║██║     ██║   ██║       ██║     ██╔══██╗
  //  ███████╗██╔╝ ██╗██║     ███████╗██║╚██████╗██║   ██║       ╚██████╗██████╔╝
  //  ╚══════╝╚═╝  ╚═╝╚═╝     ╚══════╝╚═╝ ╚═════╝╚═╝   ╚═╝        ╚═════╝╚═════╝
  //
  //  ╦╔═╗  ┌─┐┬─┐┌─┐┬  ┬┬┌┬┐┌─┐┌┬┐
  //  ║╠╣   ├─┘├┬┘│ │└┐┌┘│ ││├┤  ││
  //  ╩╚    ┴  ┴└─└─┘ └┘ ┴─┴┘└─┘─┴┘
  // If explicitCb provided, run the handleExec logic, then call the explicit callback.
  //
  // > All of the additional checks from below (e.g. try/catch) are NOT performed
  // > in the situation where an explicit callback was provided.  This is to allow
  // > for userland code to squeeze better performance out of particular method calls
  // > by simply passing through the callback directly.
  // > (As a bonus, it also avoids duplicating the code below in this file.)
  if (explicitCbMaybe) {

    handleExec(explicitCbMaybe);

    //  ██████╗ ███████╗████████╗██╗   ██╗██████╗ ███╗   ██╗
    //  ██╔══██╗██╔════╝╚══██╔══╝██║   ██║██╔══██╗████╗  ██║
    //  ██████╔╝█████╗     ██║   ██║   ██║██████╔╝██╔██╗ ██║
    //  ██╔══██╗██╔══╝     ██║   ██║   ██║██╔══██╗██║╚██╗██║
    //  ██║  ██║███████╗   ██║   ╚██████╔╝██║  ██║██║ ╚████║
    //  ╚═╝  ╚═╝╚══════╝   ╚═╝    ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═══╝
    //
    //  ██╗   ██╗███╗   ██╗██████╗ ███████╗███████╗██╗███╗   ██╗███████╗██████╗
    //  ██║   ██║████╗  ██║██╔══██╗██╔════╝██╔════╝██║████╗  ██║██╔════╝██╔══██╗
    //  ██║   ██║██╔██╗ ██║██║  ██║█████╗  █████╗  ██║██╔██╗ ██║█████╗  ██║  ██║
    //  ██║   ██║██║╚██╗██║██║  ██║██╔══╝  ██╔══╝  ██║██║╚██╗██║██╔══╝  ██║  ██║
    //  ╚██████╔╝██║ ╚████║██████╔╝███████╗██║     ██║██║ ╚████║███████╗██████╔╝
    //   ╚═════╝ ╚═╝  ╚═══╝╚═════╝ ╚══════╝╚═╝     ╚═╝╚═╝  ╚═══╝╚══════╝╚═════╝
    //
    return;

  }//-•

  // Otherwise, no explicit callback was provided- so we'll build & return a Deferred...


  //   ██████╗ ████████╗██╗  ██╗███████╗██████╗ ██╗    ██╗██╗███████╗███████╗
  //  ██╔═══██╗╚══██╔══╝██║  ██║██╔════╝██╔══██╗██║    ██║██║██╔════╝██╔════╝██╗
  //  ██║   ██║   ██║   ███████║█████╗  ██████╔╝██║ █╗ ██║██║███████╗█████╗  ╚═╝
  //  ██║   ██║   ██║   ██╔══██║██╔══╝  ██╔══██╗██║███╗██║██║╚════██║██╔══╝  ██╗
  //  ╚██████╔╝   ██║   ██║  ██║███████╗██║  ██║╚███╔███╔╝██║███████║███████╗╚═╝
  //   ╚═════╝    ╚═╝   ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝ ╚══╝╚══╝ ╚═╝╚══════╝╚══════╝
  //
  //  ██████╗ ██╗   ██╗██╗██╗     ██████╗
  //  ██╔══██╗██║   ██║██║██║     ██╔══██╗
  //  ██████╔╝██║   ██║██║██║     ██║  ██║
  //  ██╔══██╗██║   ██║██║██║     ██║  ██║
  //  ██████╔╝╚██████╔╝██║███████╗██████╔╝
  //  ╚═════╝  ╚═════╝ ╚═╝╚══════╝╚═════╝
  //
  //  ██████╗ ███████╗███████╗███████╗██████╗ ██████╗ ███████╗██████╗
  //  ██╔══██╗██╔════╝██╔════╝██╔════╝██╔══██╗██╔══██╗██╔════╝██╔══██╗
  //  ██║  ██║█████╗  █████╗  █████╗  ██████╔╝██████╔╝█████╗  ██║  ██║
  //  ██║  ██║██╔══╝  ██╔══╝  ██╔══╝  ██╔══██╗██╔══██╗██╔══╝  ██║  ██║
  //  ██████╔╝███████╗██║     ███████╗██║  ██║██║  ██║███████╗██████╔╝
  //  ╚═════╝ ╚══════╝╚═╝     ╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚═════╝
  //
  // Build deferred object.
  //
  // > Note: to temporarily switch between the prototype/constructor strategy
  // > and the closure strategy comment out the inline dictionary definition
  // > below in favor of uncommenting the following single line with the `new`
  // > keyword.  (Or vice versa.)
  // >
  // > For more info & benchmarks, see:
  // > https://github.com/mikermcneil/parley/commit/5996651c4b15c7850b5eb2e4dc038e8202414553#commitcomment-20256030
  // >
  // > And also `baseline.benchmark.js` in this repo.
  // >
  // > But then also see:
  // > https://github.com/mikermcneil/parley/commit/023dc9396bdfcd02290624ca23cb2d005037f398
  // >
  // > (Basically, it keeps going back and forth, and we want the freedom to easily tweak it.
  // >  So that's why both ways are still in here, but one is always commented out.)



  // using constructor/prototype:
  // `````````````````````````````````````````````````````````````````````````````````````````````````````````
  var π = new Deferred(handleExec);
  // `````````````````````````````````````````````````````````````````````````````````````````````````````````

  // ============================================================================================
  //
  // -OR-
  //
  // ============================================================================================


  // using closure:
  // `````````````````````````````````````````````````````````````````````````````````````````````````````````
  // var π = {

  //   /**
  //    * .exec()
  //    *
  //    * @param  {Function} cb
  //    */
  //   exec: function (cb){

  //     // Currently, codeName is always falsey
  //     // (this is for performance-- see link above for more info.)
  //     var codeName = '';

  //     if (_.isUndefined(cb)) {
  //       throw new Error(
  //         'No callback supplied. Please provide a callback function when calling .exec().  '+
  //         'See http://npmjs.com/package/parley for help.'
  //       );
  //     }//-•

  //     if (!_.isFunction(cb)) {
  //       throw new Error(
  //         'Sorry, `.exec()` doesn\'t know how to handle a callback like that:\n'+
  //         util.inspect(cb, {depth: 1})+'\n'+
  //         'Instead, please provide a callback function when calling .exec().  '+
  //         'See http://npmjs.com/package/parley for help.'
  //       );
  //     }//-•

  //     // Spinlock
  //     if (hasBegunExecuting) {
  //       console.warn(
  //         '\n'+
  //         'That\'s odd... It looks like '+(codeName ? codeName+'()' : 'this Deferred')+' '+
  //         'has already '+(hasFinishedExecuting?'finished':'begun')+' executing.\n'+
  //         'But attempting to execute a Deferred more than once tends to cause\n'+
  //         'unexpected race conditions and other bugs!  So to be safe, rather than\n'+
  //         'executing it twice, the second attempt was ignored automatically, and\n'+
  //         'this warning was logged instead.  See http://npmjs.com/package/parley for help.\n'+
  //         'Stack trace:\n'+
  //         '```\n'+
  //         ((new Error()).stack).replace(/^.+\n/, '')+
  //         '```\n'
  //       );
  //       return;
  //     }//-•
  //     hasBegunExecuting = true;

  //     // - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  //     // FUTURE: implement configurable timeout here
  //     // - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  //     try {
  //       handleExec(function (err, result) {
  //
  //         // - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  //         // FUTURE: implement configurable timeout here
  //         // e.g.
  //         // ```
  //         // if (hasFinishedExecuting) {
  //         //   console.warn(
  //         //     'Something seems to be wrong with this function.\n'+
  //         //     'It is trying to trigger your .exec() handler AGAIN...\n'+
  //         //     'after already calling it once.\n'+
  //         //     '(silently ignoring this...)'
  //         //   );
  //         //   return;
  //         // }
  //         // ```
  //         // - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  //
  //         if (err) {
  //           if (_.isError(err)) { /* ok */ }
  //           else if (_.isString(err)) { err = new Error(err); }
  //           else { err = new Error(util.inspect(err, {depth: 5})); }

  //           hasFinishedExecuting = true;
  //           return cb(err);
  //         }//-•

  //         hasFinishedExecuting = true;
  //         return cb(undefined, result);

  //       });
  //     } catch (e) {

  //       var err;
  //       if (_.isError(e)) { err = e; }
  //       else if (_.isString(e)) { err = new Error(e); }
  //       else { err = new Error(util.inspect(e, {depth: 5})); }

  //       hasFinishedExecuting = true;

  //       return cb(new Error(
  //         'Unexpected error was thrown while executing '+
  //         (codeName ? codeName+'()' : 'this Deferred')+':\n'+
  //         '```\n'+
  //         err.stack+'\n'+
  //         '```'
  //       ));

  //     }//</catch>
  //   },

  //   /**
  //    * .then()
  //    *
  //    * For usage, see:
  //    * http://bluebirdjs.com/docs/api/then.html
  //    */
  //   then: function (){
  //     var promise = π.toPromise();
  //     return promise.then.apply(promise, Array.prototype.slice.call(arguments));
  //   },

  //   /**
  //    * .catch()
  //    *
  //    * For usage, see:
  //    * http://bluebirdjs.com/docs/api/catch.html
  //    */
  //   catch: function (){
  //     var promise = π.toPromise();
  //     return promise.catch.apply(promise, Array.prototype.slice.call(arguments));
  //   },

  //   /**
  //    * .toPromise()
  //    *
  //    * Begin executing this Deferred and return a promise.
  //    *
  //    * > See also:
  //    * > http://bluebirdjs.com/docs/api/promisify.html
  //    *
  //    * @returns {Promise}
  //    */
  //   toPromise: function (){
  //     var promise = bluebird.promisify(π.exec)();
  //     return promise;
  //   },

  // };
  // `````````````````````````````````````````````````````````````````````````````````````````````````````````


  //  ██████╗ ███████╗████████╗██╗   ██╗██████╗ ███╗   ██╗
  //  ██╔══██╗██╔════╝╚══██╔══╝██║   ██║██╔══██╗████╗  ██║
  //  ██████╔╝█████╗     ██║   ██║   ██║██████╔╝██╔██╗ ██║
  //  ██╔══██╗██╔══╝     ██║   ██║   ██║██╔══██╗██║╚██╗██║
  //  ██║  ██║███████╗   ██║   ╚██████╔╝██║  ██║██║ ╚████║
  //  ╚═╝  ╚═╝╚══════╝   ╚═╝    ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═══╝
  //
  //  ██████╗ ███████╗███████╗███████╗██████╗ ██████╗ ███████╗██████╗
  //  ██╔══██╗██╔════╝██╔════╝██╔════╝██╔══██╗██╔══██╗██╔════╝██╔══██╗
  //  ██║  ██║█████╗  █████╗  █████╗  ██████╔╝██████╔╝█████╗  ██║  ██║
  //  ██║  ██║██╔══╝  ██╔══╝  ██╔══╝  ██╔══██╗██╔══██╗██╔══╝  ██║  ██║
  //  ██████╔╝███████╗██║     ███████╗██║  ██║██║  ██║███████╗██████╔╝
  //  ╚═════╝ ╚══════╝╚═╝     ╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚═════╝
  //
  // Return deferred object
  return π;

};
