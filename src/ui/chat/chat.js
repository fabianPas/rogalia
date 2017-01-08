/* global dom, Panel, game, localStorage, TT, config, util, TS, T, ChatRing */

"use strict";
function Chat() {
    var self = this;
    var channels = {
        global       : 0,
        local        : 1,
        party        : 2,
        trade        : 3,
        server       : 5,
        private      : 6,
        system       : 7,
        announcement : 8,
        npc          : 9,
        custom       : 100,
        en: 99,
        ru: 98,
        ja: 97,
    };

    this.newMessageElement = dom.tag("input", "#new-message");
    this.newMessageElement.type = "text";

    var defaultPrefix = "";
    var privateRegexp = /^\*to (\S+) /;

    this.send = function(message) {
        if (message[0] != "*" && defaultPrefix)
            message = "*" + channels[defaultPrefix] + " " + message;

        game.network.send("chat-message", {message: message});
    };

    this.useNotifications = false;

    this.initNotifications = function() {
        if (!("Notification" in window))
            return;
        switch(Notification.permission) {
        case "granted":
            this.useNotifications = true;
            break;
        case "default":
            Notification.requestPermission(function(status) {
                this.useNotifications = (status == "granted");
            }.bind(this));
        }
    };

    var lastPrivate = "";
    this.preparePrivate = function(name) {
        this.newMessageElement.value = "*to " + name + " ";
        this.newMessageElement.focus();
    };

    this.makeNameActions = function(name) {
        var partyActions = {
            inviteToParty: function() {
                self.send("*invite " + name);
            }
        };

        var party = game.player.Party;
        if (party && party[0] == game.playerName) {
            partyActions.kickFromParty = function() {
                self.send("*kick " + name);
            };
        }

        var actions = [
            {
                privateMessage: () => self.preparePrivate(name)
            },
            "---",
            partyActions,
            "---",
            {
                addToFriends: function() {
                    game.network.send(
                        "friend-add",
                        {Name: name},
                        game.controller.system.users.updateFriendsTab
                    );
                },
                removeFromFriends: function() {
                    game.network.send(
                        "friend-remove",
                        {Name: name},
                        game.controller.system.users.updateFriendsTab
                    );
                },
            },
            "---",
            {
                addToBlacklist: function() {
                    game.network.send(
                        "blacklist-add",
                        {Name: name},
                        game.controller.system.users.updateBlacklistTab
                    );
                },
                removeFromBlacklist: function() {
                    game.network.send(
                        "blacklist-remove",
                        {Name: name},
                        game.controller.system.users.updateBlacklistTab
                    );
                },
            }
        ];
        if (game.player.IsAdmin) {
            actions.push("---");
            actions.push({
                teleport: function() {
                    game.network.send("teleport", {name: name});
                },
                summon: function() {
                    game.network.send("summon", {name: name});
                }
            });
        }
        return actions;
    };

    this.nameMenu = function(e, name) {
        e.stopPropagation();

        var privateIndex = name.indexOf(privateSymbol);
        if (privateIndex != -1) {
            var fromName = name.substring(0, privateIndex);;
            if (fromName == game.playerName)
                name = name.substring(privateIndex + privateSymbol.length);
            else
                name = fromName;
        }

        switch (e.button) {
        case game.controller.LMB:
            if (game.player.IsAdmin && e.altKey) {
                game.network.send('teleport', {name: name});
                return true;
            }

            if (e.shiftKey) {
                self.link("${" + name + "}");
                return true;
            }

            if (privateIndex != -1 || e.ctrlKey) {
                self.preparePrivate(name);
            } else {
                if (self.newMessageElement.value.length == 0)
                    name += ", ";
                self.append(name);
                self.activate();

            }
            break;
        case game.controller.RMB:
            game.menu.show(self.makeNameActions(name));
            break;
        }
        return true;
    };

    function onmousedown(e) {
        if (e.target.classList.contains("recipe-link")) {
            game.controller.craft.search(e.target.dataset.recipe, true);
            return true;
        }

        if (e.target.classList.contains("marker-link")) {
            var marker = e.target.dataset.marker.split(" ");
            var x = marker.shift();
            var y = marker.shift();
            var title = marker.join(" ");
            game.controller.minimap.addMarker(x, y, title);
            game.controller.minimap.panel.show();
            return true;
        }

        if (e.target.classList.contains("channel-link")) {
            self.setCustomChannel(e.target.dataset.channel);
            return true;
        }

        if (!e.target.classList.contains("from"))
            return true;

        var name = e.target.textContent;
        // ignore [server] etc
        if (name[0] == "[")
            return true;

        return self.nameMenu(e, name);
    }


    function scrollToTheEnd(element) {
        element.scrollTop = element.scrollHeight;
    }

    this.linkEntity = function(entity) {
        if (!entity)
            return;

        //TODO: encapsulate
        var text = "";
        if ("getName" in entity)
            text = entity.getName();
        else
            text = entity.name || entity.Name;

        this.link("${" + text.replace(/\n/g, " ") + "}");

        if (game.player.IsAdmin || entity.Group == "portal") {
            this.addMessage("id: " + entity.Id);
        }
    };

    this.linkRecipe = function(type) {
        this.link("${recipe:" + type +"}");
    };

    this.linkValue = function(value, name) {
        var text = "${value:" + name + "/" + util.toFixed(value.Current, 2);
        if (value.Max && value.Max != value.Current) {
            text += "/" + util.toFixed(value.Max, 2);
        }
        text += "}";
        this.link(text);
    };

    this.link = function(text) {
        this.append(text);
        _.defer(() => this.activate());
    };

    var myMessages = new ChatRing();
    myMessages.loadFromStorage();

    this.autocomplete = function(message) {
        var data = game.controller.system.users.getOnlinePlayers();
        var candidates = [];

        for (var i = 0; i < data.length; i++) {
            if (data[i].indexOf(message) == 0 && data[i].length > message.length)
                candidates.push(data[i])
        }

        console.log(candidates);

        /*if (candidates.length > 0) {
            // some candidates for autocompletion are found
            if (candidates.length == 1) input.value = candidates[0]
            else input.value = longestInCommon(candidates, input.value.length)
            return true
        }*/
    };

    this.keydown = function(e) {
        if (e.ctrlKey && e.keyCode ==  82) {
            self.preparePrivate(lastPrivate);
            e.preventDefault();
            return false;
        }

        var message = e.target.value;
        switch (e.keyCode) {
        case 38: //up
            myMessages.save(message);
            e.target.value = myMessages.prev();
            return true;
        case 40: //down
            e.target.value = myMessages.next();
            return true;
        case 13: //enter
            if (message.length == 0) {
                e.target.blur();
            }
            break;
        case 9: // tab
            e.target.value = this.autocomplete(message);
            e.preventDefault();
            return true;
            break;
        default:
            return true;
        }
        if (message.length == 0) {
            return true;
        }

        myMessages.push(message);

        while (true) {
            var match = message.match(/^\*([^ ]*) ?(.*)?/);
            if (!match)
                break;
            var local = true;
            var cmd = match[1];
            var arg = match[2];
            switch (cmd) {
            case "where":
                self.addMessage(sprintf("%d %d %d", game.player.X, game.player.Y, game.player.Z));
                break;
            case "list-channels":
                this.listChannels();
                break;
            case "set-channel":
                self.setCustomChannel(arg);
                break;
            case "lvl-down":
                self.send(sprintf("*teleport %d %d %d", game.player.X, game.player.Y, game.player.Z + 1));
                break;
            case "lvl-up":
                self.send(sprintf("*teleport %d %d %d", game.player.X, game.player.Y, game.player.Z - 1));
                break;
            case "help":
                self.addMessage("global: 0, local: 1");
                break;
            case "return-home":
                game.network.send(cmd);
                break;
            case "fullscreen":
                game.toggleFullscreen();
                break;
            case "friend-add":
            case "friend-remove":
            case "blacklist-add":
            case "blacklist-remove":
                game.network.send(cmd, {Name: arg});
                break;
            case "add":
                if (Entity.templates[arg]) {
                    game.controller.newCreatingCursor(arg);
                    e.target.blur();
                    break;
                }
                new Panel(
                    "add",
                    arg,
                    _.filter(Entity.templates, function(entity, type) {
                        return entity.Type.contains(arg) || entity.title.contains(arg);
                    }).map(function(entity) {
                        return dom.button(entity.title + " / " + entity.Type, "add-entity-button", function() {
                            game.controller.newCreatingCursor(entity.Type);
                        });
                    })
                ).setTemporary(true).show();
                break;
            case "clear-equip-slot":
                var args = message.split(" ");
                args[2] = Character.equipSlots.indexOf(args[2]);
                message = args.join(" ");
                local = false;
                break;
            case "terra":
                new Panel(
                    "terra-bar",
                    "Terraforming",
                    game.map.bioms.map(function(biom, i) {
                        return dom.wrap(
                            "slot",
                            game.map.tiles[i],
                            {
                                title: biom.Name,
                                onclick: function() {
                                    game.controller.terraCursor(game.map.tiles[i]);
                                }
                            }
                        );
                    })
                ).show();
                break;
            case "to" :
                self.send(message);
                var name = arg.substring(0, arg.indexOf(" "));
                e.target.value = "*to " + name + " ";
                lastPrivate = name;
                return true;
                break;
            default:
                local = false;
            }
            if (local) {
                e.target.value = "";
                return false;
            }
            break;
        }
        self.send(message);
        e.target.value = "";
        return true;
    };

    var semi = {
        focus: false,
        always: true,
    };

    var semihide = function() {
        if (!semi.focus && !semi.always)
            this.panel.contents.classList.add("semi-hidden");
    }.bind(this);
    var semishow = function() {
        this.panel.contents.classList.remove("semi-hidden");
    }.bind(this);

    this.init = function (data) {
        this.sync(data || []);
        this.initNotifications();
        if (config.ui.chatAttached)
            this.attach();

        setTimeout(scrollAllToTheEnd, 100);
    };

    this.attach = function() {
        dom.move(this.panel.element, game.world);
        this.panel.element.classList.add("attached-chat");
        this.panel.hideTitle();
        dom.hide(this.panel.button);
        semihide();
    };

    this.detach = function() {
        dom.move(this.panel.element, document.body);
        this.panel.element.classList.remove("attached-chat");
        this.panel.showTitle();
        dom.show(this.panel.button);
    };

    var alwaysVisible = dom.checkbox();
    alwaysVisible.id = "chat-always-visible";
    alwaysVisible.label.id = "chat-always-visible-label";
    alwaysVisible.label.title = T("Always visible");

    var savedValue = localStorage.getItem("chat.alwaysVisible");
    if (savedValue == null)
        alwaysVisible.checked = true;
    else
        alwaysVisible.checked = (savedValue == "true");

    alwaysVisible.onclick = function() {
        semi.always = !semi.always;
        localStorage.setItem("chat.alwaysVisible", semi.always);
        this.panel.contents.classList.toggle("semi-hidden");
    }.bind(this);

    var tabs = [
        {
            name: "general",
            channels: ["global", "local", "server", "private", "announcement", "npc"],
        },
        {
            name: "$",
            channels: ["trade", "server", "private", "announcement"],
            defaultPrefix: "trade",
        },
        {
            name: game.lang,
            channels: [game.lang, "local", "server", "private", "announcement", "npc"],
            defaultPrefix: game.lang,
        },
        {
            name: "private",
            channels: ["private"],
        },
        {
            name: "⚙",
            channels: ["system"],
        },
        {
            name: "party",
            defaultPrefix: "party",
            channels: ["party", "private"]
        },
        {
            name: "custom",
            defaultPrefix: "custom",
            channels: ["custom", "private"],
        }
    ].map(function(tab, i) {
        var name = tab.name;
        tab.title = TT(name);
        tab.init = function(title, contents) {
            title.classList.add("chat-tab");
            title.classList.add("chat-tab-" + name);
            tab.titleElement = title;
        };
        tab.update = function(title, content) {
            defaultPrefix = tab.defaultPrefix || "";
            scrollToTheEnd(tab.messagesElement);
            title.classList.remove("has-new-messages");
        };
        var messagesElement = dom.div("messages");
        messagesElement.innerHTML = localStorage.getItem("chat.log." + name) || "";

        tab.contents = [messagesElement];
        tab.messagesElement = messagesElement;

        return tab;
    });

    var tabElem = dom.tabs(tabs);
    tabElem.contents.appendChild(this.newMessageElement);
    tabElem.contents.id = "chat-wrapper";
    tabElem.addEventListener("mousedown", onmousedown);

    function scrollAllToTheEnd(element) {
        tabs.forEach(function(tab) {
            scrollToTheEnd(tab.messagesElement);
        });
    }

    this.panel = new Panel(
        "chat",
        "Chat",
        [
            tabElem,
            alwaysVisible.label,
        ]
    ).show();
    this.removeAlert = game.controller.makeHighlightCallback("chat", false);

    // hide on load
    if (!alwaysVisible.checked)
        alwaysVisible.onclick();

    this.panel.hooks.show = function() {
        this.initNotifications();
        this.newMessageElement.blur(); //fixes escape on empty input
        this.newMessageElement.focus();
        this.removeAlert();
    }.bind(this);

    this.newMessageElement.onfocus = function() {
        semi.focus = true;
        semishow();
    };
    this.newMessageElement.onblur = function(e) {
        // this hack allows onclick events for settings button and chat links
        setTimeout(function() {
            semi.focus = false;
            semihide();
        }, 500);
    };
    this.newMessageElement.onmouseenter = semishow;
    tabElem.contents.onmouseleave = semihide;

    var SERVER = "[server]";

    this.format = function(body) {
        var matches = body.match(/\${[^}]+}|https?:\/\/\S+|#\S+|^>.*/g);
        var content = dom.tag("span", "body");
        if (matches) {
            body = matches.reduce(function(body, match) {
                return parseMatch(content, body, match);
            }, body);

            if (body.length)
                dom.appendText(content, body);
        } else {
            content.textContent = body;
        }
        return content;
    };


    function parseMatch (content, body, match) {
        var index = body.indexOf(match);
        if (index > 0) {
            dom.appendText(content, body.substr(0, index));
        }

        var element = null;
        var simple = {tag: "code", className: "", content: ""};

        switch(match) {
        case "${lmb}":
            simple.className = "lmb";
            break;
        case "${rmb}":
            simple.className = "rmb";
            break;
        case "${hr}":
            simple.tag = "hr";
            break;
        case "${triforce}":
            element = dom.tag("pre");
            element.style.lineHeight = 1;
            element.innerHTML = " ▲\n▲ ▲";
            break;
        default:
            switch (match[0]) {
            case ">":
                simple.tag = "quote";
                simple.content = match;
                break;
            default:
                element = parseComplexMatch(match);
            }
        }

        dom.append(
            content,
            element || dom.tag(simple.tag, simple.className, {text : simple.content})
        );

        return body.substr(index + match.length);
    };

    var complexHandlers = {
        "https://": makeLinkParser("https"),
        "http://": makeLinkParser("http"),
        "recipe:": recipeParser,
        "value:": valueParser,
        "marker:": markerParser,
        "channel:": channelParser,
        "b:": makeTagParser("b"),
        "i:": makeTagParser("i"),
        "u:": makeTagParser("u"),
        "s:": makeTagParser("s"),
        "img:": imgParser,
    };

    function parseComplexMatch(match) {
        var startIndex = 0;
        var len = match.length;
        if (match[0] == "$") {
            startIndex = 2;
            len -= 3;
        }

        for(var prefix in complexHandlers) {
            var n = prefix.length;
            if (match.substr(startIndex, n) == prefix) {
                var data = match.substr(startIndex+n, len-n);
                return complexHandlers[prefix](data);
            }
        }
        var text = match.substr(startIndex, len);
        var common = dom.tag("code");
        var maxLen = 40;
        if (text.length > maxLen) {
            common.title = text;
            text = text.substr(0, maxLen) + "...";
        }
        common.textContent = text;

        return common;
    }

    function makeLinkParser(proto) {
        return function(data) {
            var url = proto + "://" + data;
            try {
                var link = dom.link(url, decodeURI(url));
                return link;
            } catch(e) {
                return data;
            }
        };
    }

    function makeTagParser(tag) {
        return function(data) {
            return dom.tag(tag, "", {text: data});
        };
    }

    function recipeParser(data) {
        var link = dom.link("", T("Recipe") + ": " + TS(data), "recipe-link");
        link.dataset.recipe = data;
        return link;
    }

    function valueParser(data) {
        var [name, current, max] = data.split("/");
        var text = TS(name || "?") + ": " + (current || "?");
        if (max) {
            text += "/" + max;
        }
        return dom.make("code", text);
    }

    function markerParser(data) {
        var link = dom.link("", "", "marker-link");
        var title = data.split(" ").slice(2).join(" ") || T("Marker");
        link.textContent = title;
        link.dataset.marker = data;
        return link;
    }

    function channelParser(data) {
        var link = dom.link("", "", "channel-link");
        link.textContent = "#" + data;;
        link.dataset.channel = data;
        return link;
    }

    function imgParser(data) {
        var img = Entity.getPreview(data);
        img.className = "";

        var title = T(data);
        var cnt = dom.make("span", dom.tag("code", "", {text : title, title : title}));

        if (img.width) {
            cnt.appendChild(img);
        }

        return cnt;
    }

    function fromMe(message) {
        return !message.From || message.From == game.playerName;
    }

    function appendMessage(message, contents) {
        var channel = message.Channel || 0;
        if (message.To && message.From != SERVER)
            channel = channels.private;

        var channelName = _.findKey(channels, _.partial(_.isEqual, channel));
        var elem = dom.div("message");
        elem.classList.add("channel-" + channelName);
        if (fromMe(message))
            elem.classList.add("from-me");

        if (message.From == "TatriX" || message.From == "Nanalli")
            elem.classList.add("from-admin");

        dom.append(elem, contents);

        tabs.forEach(function(tab) {
            if (tab.channels.indexOf(channelName) == -1)
                return;
            if (!tab.isActive()) {
                if (channelName == "private" && tab.name != "private")
                    return;

                tab.titleElement.classList.add("has-new-messages");
            }

            var element = tab.messagesElement;
            var m = elem.cloneNode(true);
            element.appendChild(m);
            cleanUpTab(element);

            if (tab.isActive()) {
                var scroll = (element.scrollHeight - element.scrollTop <= element.clientHeight + 4*m.clientHeight);
                if (scroll)
                    scrollToTheEnd(element);
            }

        });
    }

    var maxMessages = 128;
    function cleanUpTab(messagesElement) {
        var len = messagesElement.children.length;
        while (len-- >= maxMessages) {
            var height = messagesElement.firstChild.clientHeight;
            dom.remove(messagesElement.firstChild);
            messagesElement.scrollTop -= height;
        }
    };


    this.append = function(text) {
        this.newMessageElement.value += text;
    };

    function processServerMessage(message) {
        if (message.Body[0] == "{") {
            var event = JSON.parse(message.Body);
            switch (event.Event) {
            case "logon":
                game.controller.addPlayer(event.Name);
                message.Body = TT("{name} logged in", {name: event.Name});
                message.Channel = channels.system;
                break;
            case "logoff":
                game.controller.removePlayer(event.Name);
                message.Body = TT("{name} disconnected", {name: event.Name});
                message.Channel = channels.system;
                break;
            }
        }
    }

    var privateSymbol = " → ";
    this.addMessage = function(message) {
        if (typeof message == 'string') {
            message = {
                From: null,
                Channel: channels.system,
                Body: message
            };
        }

        var sendNotification = !game.focus;
        var contents = [];

        switch(message.Channel) {
        case channels.announcement:
            message.From = SERVER;
            message.Body = TT(message.Body);
            game.controller.showAnnouncement(message.Body);
            break;
        }
        this.addBallon(message);

        if (message.From && message.Channel != channels.private) {
            var fromElement = dom.tag("span", "from");
            var color = null;
            switch(message.From) {
            case "TatriX":
                color = "#84ffff";
                break;
            case "Nanalli":
                color = "#f16980";
                break;
            case SERVER:
                color = "yellow";
                message.From = "[" + T("server") + "]";
                processServerMessage(message);
                break;
            default:
                if (message.Channel == channels.npc) {
                    color = "#ccc";
                    sendNotification = false;
                }
            }
            if (message.From) {
                if (color)
                    fromElement.style.color = color;
                fromElement.textContent = message.From;

                if (message.To && message.From != SERVER) {
                    fromElement.textContent += privateSymbol + message.To;
                    fromElement.style.color = "violet";
                }

                var now = new Date();
                fromElement.title = '[' + now.getHours() + ':' + now.getMinutes() + ']';
                contents.push(fromElement);
                contents.push(dom.text(": "));
            }
        }

        contents.push(this.format(message.Body));

        appendMessage(message, contents);

        if (fromMe(message) || !sendNotification)
            return;

        var config = {
            icon : "assets/rogalik-64.png",
            tag: "chat-msg"
        };
        if (message.From != SERVER || message.Body.search(/.* logged in/) == -1) {
            var subject = message.From;
            config.body = message.Body;
        } else {
            subject = message.Body;
        }

        if (!this.useNotifications || !game.config.sound.chatNotifications)
            return;

        game.sound.playSound("beep");

        var notification = new Notification(subject, config);
        notification.onclick = function() {
            if ("ui" in config && !config.ui.chatAttached)
                this.panel.show();
            notification.close();
        }.bind(this);
    };

    this.sync = function(data) {
        var needAlert = false;
        for(var i = 0, l = data.length; i < l; i++) {
            this.addMessage(data[i]);
            if (data[i].From != game.playerName) {
                if (data[i].Channel != channels.npc)
                    needAlert = true;
            }
        }
        if (needAlert)
            game.controller.highlight("chat", false);
    };


    this.addBallon = function(message) {
        if (!config.ui.chatBalloons)
            return;
        var character = game.characters.get(message.From);
        if(!character)
            return;
        if (!game.player.see(character))
            return;

        if (character.ballon) {
            character.ballon.remove();
        }

        var ballon = dom.div("ballon");
        character.ballon = ballon;

        ballon.remove = function() {
            ballon.parentNode.removeChild(ballon);
            character.ballon = null;
        };

        var maxLen = 30;
        var text = message.Body.substr(0, maxLen).replace(/\${[^}]+}?/g, "[..]");
        if (text.length > maxLen)
            text += '...';

        ballon.textContent = text;

        dom.insert(ballon);
        var padding = (character.sprite.width - ballon.offsetWidth) / 2;

        ballon.update = function() {
            var p = character.screen();
            if (p.x < game.camera.x || p.x > game.screen.width + game.camera.x ||
                p.y < game.camera.y || p.y > game.screen.height + game.camera.y) {
                ballon.style.display = "none";
                return;
            }
            ballon.style.display = "block";
            ballon.style.left = padding + game.offset.x  - game.camera.x +
                p.x - character.sprite.width / 2 + "px";

            ballon.style.top = game.offset.y - game.camera.y +
                (p.y - 1.2 * character.nameOffset() - ballon.offsetHeight) + "px";
        };
        ballon.update();

        setTimeout(function() {
            character.ballon && character.ballon.remove();
        }, 3000);
    };

    this.activate = function() {
        if (config.ui.chatAttached) {
            this.newMessageElement.focus();
            this.panel.toTop();
        } else {
            this.panel.show();
        }

        scrollAllToTheEnd();
    };

    this.save = function() {
        tabs.forEach(function(tab) {
            localStorage["chat.log." + tab.name] = tab.messagesElement.innerHTML;
        });
        myMessages.saveToStorage();
    };

    this.updateChannels = function(channels) {
        let channel = _.first(channels);
        if (channel) {
            channels.custom = channel.Channel;
            // var tab = _.find(tabs, { name: "custom" });
        }
    };

    this.setCustomChannel = function(name) {
        if (!setChannel())
            game.network.send("chat-message", {message: "*join-channel " + name}, setChannel);

        function setChannel() {
            let channel = _.find(game.player.ChatChannels, {Name: name});
            if (!channel) {
                return false;
            }
            self.addMessage({
                Body: "-> " + channel.Name,
                Channel: channels.custom,
            });
            channels.custom = channel.Channel;
            return true;
        }
    };

    this.listChannels = function() {
        var self = this;
        if (game.player.ChatChannels.length == 0) {
            self.addMessage({
                Body: T("No active channels"),
                Channel: channels.custom,
            });
            return;
        }

        game.player.ChatChannels.forEach(function(channel) {
            self.addMessage({
                Body: channel.Name + ": " + channel.Members.join(", "),
                Channel: channels.custom,
            });
        });
    };
}
