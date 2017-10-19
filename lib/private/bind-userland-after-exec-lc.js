/**
 * Module dependencies
 */

var util = require('util');
var _ = require('@sailshq/lodash');
var flaverr = require('flaverr');


/**
 * bindUserlandAfterExecLC()
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
module.exports = function bindUserlandAfterExecLC(lcType, negotiationRuleOrWildcardHandler, specificHandler, deferred){

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
    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
    // TODO: add support for flaverr/bluebird/lodash-style dictionary negotiation rules
    // ```
    // else if (_.isObject(negotiationRule) && !_.isArray(negotiationRule) && !_.isFunction(negotiationRule)) {
    //   //…
    // }
    // ```
    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
    else {
      throw flaverr({
        name:
          'UsageError',
        message:
          'Invalid usage of `.'+lcType+'()`.  Invalid error negotiation rule: `'+util.inspect(negotiationRule,{depth:null})+'`.\n'+
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

