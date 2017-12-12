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
const collectLogs = require('../libs/collect-logs.js');

const dhcp = require('../modules/ip-dhcp.js');
const autoIface = require('../modules/auto-iface.js');
const autoIp = require('../modules/auto-ip.js');

async function start(configBody) {

    let log = logsPool.get(configBody.jailName);
    let archive = `${path.join(config.cacheDir, configBody.base)}.tar`;

    await log.notice('decompression...');

    try {

        let fd = fs.openSync(archive, 'r');
        fs.closeSync(fd);

    } catch(e) {

        if (e.code !== 'ENOENT') {

            console.log(e);
            throw e;

        }

        let result = fetch(`${config.bases}/${configBody.base}.tar`, archive);

        if (!result) {

            throw new Error('error fetching file.');

        }

    }

    await log.notice('done!');

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

        tar.x({
            file: archive,
            cwd: configBody.path,
            sync: true,
        });

    }

    await log.notice('storage done!');

    if (config.resolvSync) {

        fs.copyFileSync('/etc/resolv.conf', `${configBody.path}/etc/resolv.conf`);
        await log.notice('resolv.conf sync done!');

    }

    await log.notice('mounting...');

    configBody.mounts.forEach(points => {

        let [src, dst] = points;
        dst = path.join(configBody.path, dst);

        mkdirSync(dst);

        let result = spawnSync('mount_nullfs', [
            src, dst,
        ]);

    });

    await log.notice('done!');

    let rctlObj = new Rctl(configBody.rctl, configBody.jailName);
    rctlObj.execute();

    await log.notice('rctl done!');

    let jail = new Jail(configBody);
    dataJails.add(jail);
    let configObj = jail.configFileObj;

    configObj
        .pipe(dhcp.getPipeRule(jail).bind(dhcp))
        .pipe(autoIface.pipeRule.bind(autoIface))
        .pipe(autoIp.pipeRule.bind(autoIp))
        .pipe(configObj.out.bind(configObj));

    await log.info(configObj.toString());

    await log.notice('jail starting...');
    await jail.start();
    await log.notice('done!');

    if (configBody.cpuset !== false) {

        let result = spawnSync('cpuset', [
            '-l', configBody.cpuset, '-j', jid
        ]);

    }

    await log.notice('cpuset done!');

    await log.notice('package installing...');

    if (configBody.pkg) {

        let child = spawn('pkg', [
                '-j', configBody.jailName, 'install', '-y', ...configBody.pkg
            ], {
                stdio: ['ignore', 'pipe', 'pipe']
            });

        await collectLogs(child);

    }


    await log.notice('done!');
    await log.notice('j-poststart...');

    let promises = configBody.jPostStart.map(command => {

        let child = spawn('/usr/sbin/jexec', [
            configBody.jailName, ...command.split(' ')
        ], {
            stdio: ['ignore', 'pipe', 'pipe']
        });

        return collectLogs(child);

    });

    await Promise.all(promises);

    {

        let ip4 = jail.info['ip4.addr'].split(',');

        hosts.addHost(ip4[0], configBody.jailName);
        hosts.addHost(ip4[0], jail.info['host.hostname']);
        hosts.commit();

    }

    await log.notice('done!');

    return;

}

module.exports = start;
