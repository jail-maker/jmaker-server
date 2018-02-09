'use strict';

const Zfs = require('../zfs.js');
const Layer = require('./layer.js');

class Layers {

    constructor(pool) {

        this._pool = pool;

    }

    create(name, parent = null) {

        let zfs = new Zfs(this._pool);

        if (parent === null) {

            zfs.create(name);

        } else {

            try {

                zfs.snapshot(parent, 'last');

            } catch (error) {

                if (error.name !== 'ExistsError')
                    throw error;

            }

            zfs.clone(parent, 'last', name);

        }

        zfs.snapshot(name, 'first');

        let layer = new Layer;
        layer._pool = this._pool;
        layer.name = name;
        layer.path = zfs.get(name, 'mountpoint');
        layer.parent = parent;

        return layer;

    }

    get(name) {

        let zfs = new Zfs(this._pool);
        let layer = new Layer;

        let origin = zfs.get(name, 'origin');
        let matches = origin.match(/\b([^\/]+)@/u);

        layer._pool = this._pool;
        layer.name = name;
        layer.path = zfs.get(name, 'mountpoint');
        layer.parent = matches ? matches[1] : null;

        return layer;

    }

    has(name) {

        let zfs = new Zfs(this._pool);
        return zfs.has(name);

    }

    list() {

        let zfs = new Zfs(this._pool);
        return zfs.list()
            .map(item => item.replace(this._pool, ''))
            .map(item => item.replace('/', ''))
            .filter(item => item !== '');

    }

}

module.exports = Layers;