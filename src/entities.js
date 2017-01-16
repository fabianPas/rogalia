/* global game */

"use strict";
Entity.MT_PORTABLE = 0;
Entity.MT_LIFTABLE = 1;
Entity.MT_STATIC = 2;

Entity.LOCATION_ON_GROUND = 0;
Entity.LOCATION_IN_CONTAINER = 1;
Entity.LOCATION_EQUIPPED = 2;
Entity.LOCATION_BURDEN = 3;
Entity.LOCATION_VENDOR = 4;
Entity.QUEUEABLE_ACTIONS = ["disassemble", "entity-destroy", "BreakOff", "Rinse"];

Entity.templates = {};

Entity.init = function(data) {
    data.forEach(function(props) {
        var e = new Entity();
        e.sync(props);
        Entity.templates[e.Type] = e;
    });
};


Entity.sync = function(data, remove) {
    remove && remove.forEach((id) => game.removeEntityById(id));

    var containers = []; //to update
    for (var id in data) {
        var edata = data[id];
        var entity = game.entities.get(id);
        if (!entity) {
            entity = new Entity(edata.Type, id);
            game.addEntity(entity);
        }
        entity.sync(edata);
        entity.initSprite();

        if (game.containers[entity.Id]) {
            containers.push(game.containers[entity.Id]);
        }
    }

    containers.forEach(function(container) {
        if (container.panel.visible)
            container.update();
        else
            container.syncReq();
    });
},

Entity.get = function(id) {
    return game.entities.get(parseInt(id));
};
Entity.exists = function(id) {
    return !!Entity.get(id);
};

Entity.getPreview = function(group) {
    var image = new Image();
    for (var type in Entity.templates) {
        var template = Entity.templates[type];
        if (Entity.prototype.is.call(template, group)) {
            image = template.icon();
            break;
        }
    }
    image.className = "item-preview";
    return image;
};

Entity.find  = function(pattern) {
    var regex = new RegExp(pattern);
    return game.entities.filter(function(e) {
        return regex.test(e.Type);
    });
};

Entity.wipe = function(pattern) {
    var queue = Entity.find(pattern);
    var interval = setInterval(function() {
        if (queue.length > 0) {
            queue.pop().destroy();
        } else {
            clearInterval(interval);
        }
    }, 500);
};

Entity.books = {
    $intro: "Именем Императора и Его Синода",
};

//returns tuples [type string, recipe struct]
Entity.getSortedRecipeTuples = function() {
    return Object.keys(Entity.recipes).map(function(type) {
        return [type, Entity.recipes[type]];
    }).sort(function(a, b){
        var diff = (a[1].Lvl || 0) - (b[1].Lvl || 0);
        if (diff != 0)
            return diff;

        return (T(a[0]) < T(b[0])) ? -1 : +1;
    });
};
