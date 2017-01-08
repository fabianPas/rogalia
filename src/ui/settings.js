/* global game, Panel, dom, localStorage, config, _ */

"use strict";
function Settings() {
    Settings.instance = this;
    var tabs = this.makeSettingsTabs(game.config, "Config");
    if (game.player.IsAdmin) {
        Settings.load(game.debug);
        this.makeSettingsTabs(game.debug, "Debug").forEach(function(tab) {
            tabs.push(tab);
        });
    }
    this.panel = new Panel(
        "settings",
        "Settings",
        [dom.tabs(tabs)]
    );

    function setPlayerSettings() {
        game.network.send("set-settings", {Settings: game.player.Settings});
    };

    function setPlayerStyle() {
        game.network.send("set-style", {Style: game.player.Style});
    };

    this.triggers = {
        "settings.character.rotateWasd": function() {
            game.controller.wasd.point.set(0, 0);
        },
        "settings.ui.language": function(lang) {
            localStorage.setItem("lang", lang);
            game.reload();
        },
        "settings.sound.playMusic": function() {
            game.sound.toggleMusic();
        },
        "settings.sound.musicVolume": function(value) {
            game.sound.setMusicVolume(value);
        },
        "settings.sound.voiceVolume": function(value) {
            game.sound.setVoiceVolume(value);
        },
        "settings.sound.jukebox": function() {
            game.jukebox.toggle();
        },
        "settings.map.world": function() {
            dom.toggle(game.world);
        },
        "settings.ui.chatAttached": function(attach) {
            if (attach)
                game.chat.attach();
            else
                game.chat.detach();
        },
        "settings.ui.comboHelper": function(enabled) {
            if (enabled) {
                dom.show(document.getElementById("combos"));
            } else {
                dom.hide(document.getElementById("combos"));
            }
        },
        "settings.graphics.movingSpace": function(moving) {
            if (moving)
                game.canvas.classList.add("animated");
            else
                game.canvas.classList.remove("animated");
        },
        "settings.graphics.autoHideWalls": function(enabled) {
            if (!enabled) {
                game.player.inBuilding = false;
            }
        },
        "settings.graphics.centerScreen": function() {
            game.world.classList.toggle("snap-left");
        },
        "settings.graphics.fastRender": function() {
            game.reload();
        },
        "settings.character.pathfinding": function() {
            game.player.Settings.Pathfinding = !game.player.Settings.Pathfinding;
            setPlayerSettings();
        },
        "settings.character.hideHelmet": function() {
            game.player.Style.HideHelmet = !game.player.Style.HideHelmet;
            setPlayerStyle();
            game.player.reloadSprite();
        },
    };
}

Settings.load = function(map) {
    Object.keys(map).forEach(function(name) {
        var group = map[name];
        Object.keys(group).forEach(function(prop) {
            if (group[prop] instanceof Function)
                return;
            var key = ["settings", name, prop].join(".");
            var saved = localStorage.getItem(key);
            if (saved !== null) {
                group[prop] = JSON.parse(saved);
            }
        });
    });
};


Settings.toggle = function(key) {
    var path = key.split(".");
    var section = path[1];
    var option = path[2];
    var value = !config[section][option];
    config[section][option] = value;
    localStorage.setItem(key, value);

    var checkbox = document.getElementById(key);
    if (checkbox)
        checkbox.checked = value;

    if (Settings.instance && Settings.instance.triggers[key])
        Settings.instance.triggers[key](value);
};

//TODO: load config in separate function
Settings.prototype = {
    triggers: null,
    makeSettingsTabs: function(map, name) {
        var self = this;
        return _.map(map, function(group, name) {
            var tab = {
                title: T(name),
                contents: [],
            };

            var optionDesc = dom.div("settings-option-desc");
            optionDesc.placeholder = T("Select option");
            optionDesc.textContent = optionDesc.placeholder;

            _.forEach(group, function(value, prop) {
                var key = ["settings", name, prop].join(".");

                if (value instanceof Function) {
                    if (game.player) // eval only when player is loaded
                        value = value();
                    else
                        value = false;
                }

                var desc = Settings.descriptions[name] && Settings.descriptions[name][prop] || [prop, ""];
                var title = desc[0];
                var tip = desc[1];


                var label = makeLabel(key, value, title);
                label.onmouseover = function() {
                    optionDesc.textContent = tip;
                };
                label.onmouseout = function() {
                    optionDesc.textContent = optionDesc.placeholder;
                };
                tab.contents.push(label);
                function makeLabel(key, value, title) {
                    if (_.isArray(value)) {
                        var select = dom.select(value, game.lang);
                        select.firstChild.onchange = function() {
                            group[prop] = this.value;
                            trigger();
                        };
                        return select;
                    }

                    if (_.isNumber(value)) {
                        var range = dom.range(group[prop], function(value) {
                            group[prop] = value;
                            trigger();
                        });
                        return dom.make("label", [title, range]);
                    }

                    var checkbox = dom.checkbox(title);
                    checkbox.checked = value;
                    checkbox.id = key;
                    checkbox.onchange = function() {
                        group[prop] = !group[prop];
                        trigger();
                    };

                    return checkbox.label;
                }

                function trigger() {
                    localStorage.setItem(key, group[prop]);
                    self.triggers[key] && self.triggers[key](group[prop]);
                }
            });
            tab.contents.push(optionDesc);
            return tab;
        });
    },
};
