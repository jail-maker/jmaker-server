'use strict';

const { spawnSync, spawn } = require('child_process');
const { mkdirSync } = require('mkdir-recursive');
const path = require('path');
const fs = require('fs');
const tar = require('tar');

const fetch = require('../libs/bsd-fetch.js');
const config = require('../libs/config.js');
const dataJails = require('../libs/data-jails.js');
const FolderStorage = require('../libs/folder-storage.js');
const ZfsStorage = require('../libs/zfs-storage.js');
const logsPool = require('../libs/logs-pool.js');
const Rctl = require('../libs/rctl.js');
const Jail = require('../libs/jail.js');
const hosts = require('../libs/hosts.js');

const dhcp = require('../modules/ip-dhcp.js');
const autoIface = require('../modules/auto-iface.js');
const autoIp = require('../modules/auto-ip.js');

async function start(configBody) {

    let log = logsPool.get(configBody.jailName);
    let archive = `${path.join(config.cacheDir, configBody.base)}.tar`;

    try {

        await log.info('checking base... ');

        let fd = fs.openSync(archive, 'r');
        fs.closeSync(fd);

        await log.notice('done\n');

    } catch(e) {

        if (e.code !== 'ENOENT') {

            console.log(e);
            throw e;

        }

        await log.info('fetching base... ');

        let result = fetch(`${config.bases}/${configBody.base}.tar`, archive);

        if (!result) {

            throw new Error('error fetching file.');

        }

        await log.notice('done\n');

    }

    let storage = {};

    if (config.zfs) {

        storage = new ZfsStorage(config.zfsPool, configBody.jailName);
        configBody.setPath(storage.getPath())

        if (configBody.quota) storage.setQuota(configBody.quota);

    } else {

        storage = new FolderStorage(config.jailsDir, configBody.jailName);
        configBody.setPath(storage.getPath())

    }

    if (storage.isEmpty()) {

        await log.info('decompression... ');

        try {

            tar.x({
                file: archive,
                cwd: configBody.path,
                sync: true,
            });

        } catch (e) {

            throw new Error(e);

        }

        await log.notice('done\n');

    }

    if (config.resolvSync) {

        await log.info('resolv.conf sync... ');
        fs.copyFileSync('/etc/resolv.conf', `${configBody.path}/etc/resolv.conf`);
        await log.notice('done\n');

    }

    await log.info('mounting... ');

    configBody.mounts.forEach(points => {

        let [src, dst] = points;
        dst = path.join(configBody.path, dst);

        mkdirSync(dst);

        let result = spawnSync('mount_nullfs', [
            src, dst,
        ]);

    });

    await log.notice('done\n');

    await log.info('rctl... ');

    let rctlObj = new Rctl(configBody.rctl, configBody.jailName);
    rctlObj.execute();

    await log.notice('done\n');

    let jail = new Jail(configBody);
    dataJails.add(jail);
    let configObj = jail.configFileObj;

    configObj
        .pipe(dhcp.getPipeRule(jail).bind(dhcp))
        .pipe(autoIface.pipeRule.bind(autoIface))
        .pipe(autoIp.pipeRule.bind(autoIp))
        .pipe(configObj.out.bind(configObj));

    await log.info(configObj.toString() + '\n');

    try {

        await log.notice('jail starting...\n');
        await jail.start();
        await log.notice('done\n');

    } catch (e) {

        throw e;

    }

    if (configBody.cpuset !== false) {

        await log.info('cpuset... ');

        let result = spawnSync('cpuset', [
            '-l', configBody.cpuset, '-j', jid
        ]);

        await log.notice('done\n');

    }


    if (configBody.pkg) {

        await log.notice('package installing...\n');

        let child = spawn('pkg', [
            '-j', configBody.jailName, 'install', '-y', ...configBody.pkg
        ], {
            stdio: ['ignore', 'pipe', 'pipe']
        });

        await log.fromProcess(child);
        await log.notice('done\n');

    }

    await log.notice('j-poststart...\n');

    let promises = configBody.jPostStart.map(command => {

        let child = spawn('/usr/sbin/jexec', [
            configBody.jailName, ...command.split(' ')
        ], {
            stdio: ['ignore', 'pipe', 'pipe']
        });

        return log.fromProcess(child);

    });

    await Promise.all(promises);

    {

        let ip4 = jail.info['ip4.addr'].split(',');

        hosts.addHost(ip4[0], configBody.jailName);
        hosts.addHost(ip4[0], jail.info['host.hostname']);
        hosts.commit();

    }

    await log.notice('done\n');

    return;

}

module.exports = start;
