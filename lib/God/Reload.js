'use strict';

/**
 * @file Reload functions related
 * @author Alexandre Strzelewicz <as@unitech.io>
 * @project PM2
 */

var async         = require('async');
var cst           = require('../../constants.js');
var Common        = require('../Common');
/**
 * softReload will wait permission from process to exit
 * @method softReload
 * @param {} God
 * @param {} id
 * @param {} cb
 * @return Literal
 */
function softReload(God, id, cb) {
  var t_key = '_old_' + id;

  // Move old worker to tmp id
  God.clusters_db[t_key] = God.clusters_db[id];

  delete God.clusters_db[id];

  var old_worker = God.clusters_db[t_key];

  // Deep copy
  var new_env = JSON.parse(JSON.stringify(old_worker.pm2_env));
  new_env.restart_time += 1;

  // Reset created_at and unstable_restarts
  God.resetState(new_env);

  old_worker.pm2_env.status = cst.STOPPING_STATUS;
  old_worker.pm2_env.pm_id = t_key;
  old_worker.pm_id = t_key;

  old_worker.removeAllListeners();

  God.executeApp(new_env, function(err, new_worker) {
    if (err) return cb(err);

    var timer = null;

    var onListen = function () {
      clearTimeout(timer);
      softCleanDeleteProcess();
      console.log('-softReload- New worker listening');
    };

    // Bind to know when the new process is up
    new_worker.once('listening', onListen);

    timer = setTimeout(function() {
      new_worker.removeListener('listening', onListen);
      softCleanDeleteProcess();
    }, cst.GRACEFUL_LISTEN_TIMEOUT);

    // Remove old worker properly
    var softCleanDeleteProcess = function () {
      var cleanUp = function () {
        clearTimeout(timer);
        console.log('-softReload- Old worker disconnected');
        return God.deleteProcessId(t_key, cb);
      };

      old_worker.once('disconnect', cleanUp);

      try {
        if (old_worker.state != 'dead' && old_worker.state != 'disconnected')
          old_worker.send && old_worker.send('shutdown');
        else {
          clearTimeout(timer);
          console.error('Worker %d is already disconnected', old_worker.pm2_env.pm_id);
          return God.deleteProcessId(t_key, cb);
        }
      } catch(e) {
        clearTimeout(timer);
        console.error('Worker %d is already disconnected', old_worker.pm2_env.pm_id);
        return God.deleteProcessId(t_key, cb);
      }

      timer = setTimeout(function () {
        old_worker.removeListener('disconnect', cleanUp);
        return God.deleteProcessId(t_key, cb);
      }, cst.GRACEFUL_TIMEOUT);
      return false;
    };
    return false;
  });
  return false;
};

/**
 * hardReload will reload without waiting permission from process
 * @method hardReload
 * @param {} God
 * @param {} id
 * @param {} cb
 * @return Literal
 */
function hardReload(God, id, cb) {
  var t_key = '_old_' + id;

  // Move old worker to tmp id
  God.clusters_db[t_key] = God.clusters_db[id];
  delete God.clusters_db[id];

  var old_worker = God.clusters_db[t_key];
  // Deep copy
  var new_env = JSON.parse(JSON.stringify(old_worker.pm2_env));
  new_env.restart_time += 1;

  // Reset created_at and unstable_restarts
  God.resetState(new_env);

  old_worker.removeAllListeners();
  old_worker.pm2_env.status = cst.STOPPING_STATUS;
  old_worker.pm2_env.pm_id = t_key;
  old_worker.pm_id = t_key;

  God.executeApp(new_env, function(err, new_worker) {
    if (err) return cb(err);

    var timer = null;

    var onListen = function () {
      clearTimeout(timer);
      console.log('-reload- New worker listening');
      return God.deleteProcessId(t_key, cb);
    };

    // Bind to know when the new process is up
    new_worker.once('listening', onListen);

    timer = setTimeout(function() {
      new_worker.removeListener('listening', onListen);
      return God.deleteProcessId(t_key, cb);
    }, cst.GRACEFUL_LISTEN_TIMEOUT);

    return false;
  });
  return false;
};

/**
 * Description
 * @method exports
 * @param {} God
 * @return
 */
module.exports = function(God) {

  /**
   * GracefulReload
   * @method softReloadProcessId
   * @param {} id
   * @param {} cb
   * @return CallExpression
   */
  God.softReloadProcessId = function(opts, cb) {
    var id  = opts.id;
    var env = opts.env || {};

    if (!(id in God.clusters_db))
      return cb(new Error('PM ID unknown'));

    if (God.clusters_db[id].pm2_env.status == cst.ONLINE_STATUS &&
        God.clusters_db[id].pm2_env.exec_mode == 'cluster_mode') {

      Common.extend(God.clusters_db[id].pm2_env.env, opts.env);

      return softReload(God, id, cb);
    }
    else {
      console.log('Process %s in a stopped status, starting it', id);
      return God.restartProcessId(opts, cb);
    }
  };

  /**
   * Reload
   * @method reloadProcessId
   * @param {} id
   * @param {} cb
   * @return CallExpression
   */
  God.reloadProcessId = function(opts, cb) {
    var id  = opts.id;
    var env = opts.env || {};

    if (!(id in God.clusters_db))
      return cb(new Error('PM2 ID unknown'));

    if (God.clusters_db[id].pm2_env.status == cst.ONLINE_STATUS &&
        God.clusters_db[id].pm2_env.exec_mode == 'cluster_mode') {

      Common.extend(God.clusters_db[id].pm2_env.env, opts.env);

      return hardReload(God, id, cb);
    }
    else {
      console.log('Process %s in a stopped status, starting it', id);
      return God.restartProcessId(opts, cb);
    }
  };

};
