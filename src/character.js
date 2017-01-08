/* global util, RectPotentialField, CELL_SIZE, game, CirclePotentialField, Point, Info, dom, T, Panel, Talks */

"use strict";
function Character(id) {
    this.Id = id;
    this.name = "";
    this.x = 0;
    this.y = 0;

    this.Hp = null;
    this.Invisible = false;

    this.Title = "";
    this.Type = "";
    //used to show animation of varius type, like damage deal or exp gain
    this.info = [];
    this.Messages = null;
    this.PrivateMessages = null;

    //Character in pvp cannot move and do other actions
    this.pvp = false;

    this.Dst = {
        X: 0,
        Y: 0,
    };

    this.dst = {
        x: 0,
        y: 0,
        time: null,
        radius: 0,
    };

    this.target = null;
    this.interactTarget = {};

    this.Dx = 0;
    this.Dy = 0;
    this.Radius = CELL_SIZE / 4;
    this.isMoving = false;
    this.Speed = {Current: 0};
    this.Equip = [];

    this.IsNpc = false;

    this.Burden = 0;
    this.burden = null;
    this.plow = null;

    this.Effects = {};
    this.Clothes = [];

    this.Settings = {
        Pathfinding: true,
    };

    this.ballon = null;
    this.shownEffects = {};
    this.isPlayer = false;

    this.Action = {};
    this.action = {
        progress: 0,
        last: 0,
    };

    this.animation = {up: null, down: null};

    this.sprites = {};
    Character.animations.forEach(function(animation) {
        var s = new Sprite();
        s.name = animation;
        this.sprites[animation] = s;
    }.bind(this));
    this.sprite = this.sprites.idle;

    this._parts = "{}"; //defauls for npcs

    this._marker = {
        opacity: 1,
        delta: -1,
    };

    this._pathHistory = [];
}

Character.prototype = {
    get X() {
        return this.x;
    },
    get Y() {
        return this.y;
    },
    set X(x) {},
    set Y(y) {},
    positionSyncRequired: function(x, y) {
        if (this.Dx == 0 && this.Dy == 0) {
            return true;
        }
        return (Math.abs(this.x - x) > CELL_SIZE) || (Math.abs(this.y - y) > CELL_SIZE);
    },
    syncPosition: function(x, y) {
        if (this.positionSyncRequired(x, y)) {
            this._pathHistory = [];
            this.setPos(x, y);
        }
    },
    getZ: function() {
        return 0;
    },
    get Name() {
        // TODO: remove fix
        if (this.IsMob && this.name.match(/-\d+/))
            return util.ucfirst(this.Type);
        return this.name || util.ucfirst(this.Type);
    },
    set Name(name) {
        this.name = name;
    },
    leftTopX: Entity.prototype.leftTopX,
    leftTopY: Entity.prototype.leftTopY,
    compare: Entity.prototype.compare,
    setPoint: function(p) {
        this.setPos(p.x, p.y);
    },
    setPos: function(x, y) {
        game.sortedEntities.remove(this);
        this.x = x;
        this.y = y;
        game.sortedEntities.add(this);
    },
    screen: function() {
        if (this.mount) {
            var x = this.mount.X;
            var y = this.mount.Y;
        } else {
            x = this.X;
            y = this.Y;
        }
        return new Point(x, y).toScreen();
    },
    sync: function(data, init) {
        Character.copy(this, data);
        if (data.X && data.Y) {
            this.syncPosition(data.X, data.Y);
        }

        this.burden = (this.Burden) ? Entity.get(this.Burden) : null;
        this.plow = ("Plowing" in this.Effects) ? Entity.get(this.Effects.Plowing.Plow) : null;

        this.syncMessages(this.Messages);
        this.syncMessages(this.PrivateMessages);

        if ("Waza" in data) {
            game.controller.updateCombo(data.Waza);
        }

        if (this.Type == "margo") {
            this.reloadSprite();
        } else if (!init && JSON.stringify(this.getParts()) != this._parts) {
            this.reloadSprite();
        }

        if (data.Dir !== undefined) {
            this.sprite.position = data.Dir;
        }

        if ("AvailableQuests" in data) {
            this.updateActiveQuest();
        }
        if ("Party" in data) {
            this.updateParty(data.Party);
        }

        if ("ChatChannels" in data) {
            game.chat && game.chat.updateChannels(data.ChatChannels);
        }

        if (this.isPlayer) {
            game.controller.updateMail(this.NewMail);
            if (data.Fullness) {
                game.controller.updateItemInfo();
            }
        }
    },
    avatar: function() {
        if (this.IsNpc)
            return dom.img("assets/" + Character.npcAvatarSpriteDir + this.Type + ".png", "talk-avatar");
        return loader.loadImage("avatars/" + this.sex() + ".png");
    },
    updateParty: function(members) {
        var party = game.controller.party;
        dom.clear(party);
        if (!members)
            return;

        members.forEach(function(name, i) {
            if (name == game.playerName)
                return;
            var member = game.characters.get(name);
            if (member) {
                var avatar = member.avatar();
            } else {
                avatar = dom.div(".character-avatar-not-available", {text: "?"});
                avatar.title = T("Out of sight");
                Character.partyLoadQueue[name] = true;
            }
            var cnt = dom.div(".character-avatar-container");
            cnt.appendChild(avatar);
            var prefix = (i == 0 && party[0] != game.playerName) ? "★" : "";
            cnt.appendChild(dom.span(prefix + name, "party-member-name"));
            cnt.onmousedown = function(e) {
                return game.chat.nameMenu(e, name);
            };
            party.appendChild(cnt);
        });
    },
    syncMessages: function(messages) {
        while(messages && messages.length > 0) {
            var message = messages.shift();
            this.info.push(new Info(message, this));
        }
    },
    reloadSprite: function() {
        for (var i in this.sprites) {
            this.sprites[i].ready = false;
        }
        this.loadSprite();
    },
    init: function(data) {
        this.IsNpc = (data.Type != "player");
        this.IsMob = "Aggressive" in data;

        this.sync(data, true);
        this.loadSprite();
    },
    initSprite: function() {
        this.sprite.speed = 14000;
        this.sprite.offset = this.Radius;
        this.sprite.angle = Math.PI/4;

        var spriteInfo = Character.spritesInfo[this.Type];
        if (spriteInfo) {
            for (var key in spriteInfo) {
                this.sprite[key] = spriteInfo[key];
            }
        } else {
            this.sprite.offset = 2*this.Radius;
            this.sprite.speed = 7000;
        }
    },
    loadSprite: function() {
        var sprite = this.sprite;
        if (sprite.loading)
            return;

        this.initSprite();

        if (this.IsMob) {
            this.loadMobSprite();
            return;
        }

        if (this.IsNpc) {
            this.loadNpcSprite();
            return;
        }

        // emulate loading, because we will load sprite ourselves
        sprite.loading = true;

        var sex = this.sex();
        var animation = sprite.name;
        var dir = Character.spriteDir + sex + "/";
        var parts = this.getParts();
        this._parts = JSON.stringify(parts);

        for (var type in parts) {
            var part = parts[type];
            if (part && part.name) {
                var path = dir + animation + "/" + type + "/" + part.name + ".png";
                parts[type].image = loader.loadImage(path);
            } else {
                delete parts[type];
            }
        }

        if (sprite.name == "attack") {
            parts["weapon"] = {
                name: "sword",
                image: Character.sprites[sex].weapons.sword.image,
            };
        }

        var name = this.Name;
        loader.ready(function() {
            var canvas = dom.canvas();
            var ctx = canvas.ctx;
            var naked = Character.sprites[sex].naked[animation];
            naked = ("hair" in parts || parts.head) ? naked.clean : naked.default;

            canvas.width = naked.image.width;
            canvas.height = naked.image.height;
            ctx.drawImage(naked.image, 0, 0);
            for (var type in parts) {
                var part = parts[type];;
                var image = part.image;
                if (image && image.width > 0) {
                    if (part.color && part.opacity) {
                        var worker = new Worker("src/tint.js");
                        var tmpCanvas = util.imageToCanvas(image);
                        var tmpCtx = tmpCanvas.getContext("2d");
                        worker.onmessage = function(e) {
                            tmpCtx.putImageData(e.data, 0, 0);
                            ctx.drawImage(tmpCanvas, 0, 0);
                        };
                        worker.postMessage({
                            imageData: tmpCtx.getImageData(0, 0, image.width, image.height),
                            color: part.color,
                            opacity: part.opacity,
                        });

                        // very slow
                        // image = ImageFilter.tint(image, part.color, part.opacity);
                        // ctx.drawImage(image, 0, 0);
                    } else {
                        ctx.drawImage(image, 0, 0);
                    }
                }
            }

            sprite.image = canvas;
            sprite.framesNum = sprite.image.width / sprite.width;
            sprite.makeOutline();
            sprite.ready = true;
            sprite.loading = false;

            if (name in Character.partyLoadQueue) {
                delete Character.partyLoadQueue.name;
                game.player.updateParty(game.player.Party);
            }
        });
    },
    loadNpcSprite: function() {
        var type = this.Type;
        switch (type) {
        case "margo":
            type = (this.Owner == game.player.Id) ? "margo-naked" : "margo";
            break;
        case "vendor":
            type = "vendors/vendor-" + ([].reduce.call(this.Name, function(hash, c) {
                return hash + c.charCodeAt(0);
                }, 0) % 12 + 1);
            break;
        }

        this.sprite.load(Character.npcSpriteDir + type + ".png");
    },
    loadMobSprite: function() {
        this.sprite.load(Character.mobSpriteDir + this.Type + "/" + this.sprite.name + ".png");
    },
    getActions: function() {
        var actions = {};
        switch (this.Type) {
        case "cow":
            actions = {
                "Milk": function() {
                    game.network.send("milk", {Id: this.Id});
                }
            };
            break;
        case "rabbit":
        case "chicken":
        case "bee":
            actions = {
                "Catch": function() {
                    game.network.send("catch-animal", {Id: this.Id});
                }
            };
            break;
        default:
            if (this.Riding) {
                actions = {
                    "Mount": function() {
                        game.network.send("mount", {Id: this.Id});
                    },
                    "Dismount": function() {
                        game.network.send("dismount");
                    },
                };
            }
        }

        var common = {};
        if (this.IsMob || !this.IsNpc) {
            common.Select = game.player.setTarget.bind(game.player, this);
        }
        if (!this.IsMob && !this.IsNpc) {
            common.Inspect = game.player.inspect.bind(game.player, this);
        }
        if (this.isInteractive()) {
            common.Interact =  this.interact;
        }

        var list = [common, actions];
        if (!this.IsNpc)
            list = list.concat(game.chat.makeNameActions(this.Name));

        if (game.player.IsAdmin) {
            var admin = {};
            admin.Kill = function() {
                if (this.IsNpc && !this.IsMob)
                    game.chat.send("*remove-npc " + this.Id);
                else
                    game.chat.send("*kill " + this.Id);
            };
            admin.ComeToMe = function() {
                game.chat.send("*come-to-me " + this.Id);
            };
            admin["$cmd"] = function() {
                game.chat.append("* " + this.Id);
            };
            admin.Summon = function() {
                game.chat.send("*summon " + this.Id);
            };
            if (this.Type == "vendor") {
                admin.RemoveVendor = function() {
                    game.chat.send("*remove-vendor " + this.Name);
                };
            }
            list.push("---");
            list.push(admin);
        }

        return list;
    },
    defaultAction: function(targetOnly) {
        if (this.isInteractive()) {
            this.interact();
            return;
        }

        // call actionButton on space
        if (!targetOnly && this.isPlayer && game.controller.actionButton.active()) {
            game.controller.actionButton.activate();
            return;
        }

        if (this.isPlayer) {
            return;
        }

        var party = game.player.Party;
        if (party && _.includes(party, this.Name)) {
            return;
        }

        if (game.controller.wantShot()) {
            game.player.shot(this.x, this.y);
            return;
        }

        game.player.setTarget(this);
    },
    nameOffset: function() {
        switch (this.Type) {
        case "player":
            if (this.mount)
                return 100;
            return 80;
        case "horse":
            if (this.rider)
                return 130;
            return 100;
        }
        return this.sprite.nameOffset || this.sprite.height;
    },
    drawAction: function() {
        if(this.Action.Duration) {
            var progress = Math.min(this.action.progress, 1);
            if (this.isPlayer) {
                var ap = game.controller.actionProgress.firstChild;
                ap.style.width = progress * 100 + "%";
            } else {
                var w = 64;
                var h = FONT_SIZE * 0.5;
                var p = this.screen();
                var x = p.x - w/2;
                var y = p.y - this.nameOffset() + h + 1;
                h -= 2;

                if (!config.ui.simpleFonts) {
                    game.ctx.fillStyle = '#333';
                    game.ctx.fillRect(x-1, y-1, w+2, h+2);
                }
                game.ctx.fillStyle = '#99682e';
                game.ctx.fillRect(x, y, w, h);

                game.ctx.fillStyle = '#cf9d62';
                game.ctx.fillRect(x, y, progress * w, h);
            }
        }
    },
    see: function(character) {
        if (this == character)
            return true;
        var p = this.getDrawPoint();
        var len_x = character.X - this.X;
        var len_y = character.Y - this.Y;
        return util.distanceLessThan(len_x, len_y, Math.hypot(game.screen.width, game.screen.height));
    },
    setDst: function(x, y) {
        if (this.Speed.Current <= 0 || this.Disabled)
            return;
        var leftBorder, rightBorder, topBorder, bottomBorder;
        leftBorder = this.Radius;
        topBorder = this.Radius;
        rightBorder = game.map.full.width - this.Radius;
        bottomBorder = game.map.full.height - this.Radius;

        if (x < leftBorder) {
            x = leftBorder;
        } else if (x > rightBorder) {
            x = rightBorder;
        }

        if (y < topBorder) {
            y = topBorder;
        } else if (y > bottomBorder) {
            y = bottomBorder;
        }

        if (x == this.Dst.X && y == this.Dst.Y)
            return;

        game.network.send("set-dst", {x: x, y: y});
        game.controller.resetAction();
        this.dst.x = x;
        this.dst.y = y;
        this.dst.radius = 9;
        this.dst.time = Date.now();
        this._setDst(x, y);
    },
    _setDst: function(x, y) {
        var len_x = x - this.X;
        var len_y = y - this.Y;
        var len  = Math.hypot(len_x, len_y);

        this.Dst.X = x;
        this.Dst.Y = y;

        this.Dx = len_x / len;
        this.Dy = len_y / len;
        this._pathHistory = [];
    },
    getDrawPoint: function() {
        var p = this.screen();
        var dy = 0;
        if (this.mount)  {
            switch (this.mount.Type) {
            case "horse":
                dy = 16;
                break;
            }
        }
        return {
            p: p,
            x: Math.round(p.x - this.sprite.width / 2),
            y: Math.round(p.y - this.sprite.height + this.sprite.offset) - dy
        };
    },
    draw: function(force) {
        if ("Sleeping" in this.Effects)
            return;

        if (this.mount && !force)
            return;

        this.drawDst();

        if (!this.sprite.ready)
            return;

        var p = this.getDrawPoint();
        var s = this.screen();
        var up = this.animation.up;
        var down = this.animation.down;

        if (down) {
            var downPoint = new Point(
                s.x - down.width/2,
                p.y + this.sprite.height + this.sprite.offset - down.height
            );
            down.draw(downPoint);
            down.animate();
            if (down.frame == 0) { //finished
                this.animation.down = null;
            }
        }

        // drawing character model
        if (this.Invisible)
            this.sprite.drawAlpha(p, 0.3);
        else
            this.sprite.draw(p);

        if (up) {
            var upPoint = new Point(
                s.x - up.width/2,
                p.y + this.sprite.height + this.sprite.offset - up.height
            );
            up.draw(upPoint);
            up.animate();
            if (up.frame == 0) { //finished
                this.animation.up = null;
            }
        }

        this.drawEffects();

        if (this != game.controller.world.hovered && this == game.player.target)
            this.drawHovered(true);

        if (this.burden)
            this.drawBurden(this.burden);

        if (this.rider) {
            this.rider.draw(true);
        }
    },
    drawBowRadius() {
        var ranged = Entity.get(this.equipSlot("right-hand"));
        if (!ranged || !ranged.Range) {
            ranged = Entity.get(this.equipSlot("left-hand"));
        }
        if (!ranged || !ranged.Range) {
            return;
        }

        // maximum range radius
        game.ctx.fillStyle = "rgba(255, 0, 0, 0.2)";
        game.iso.fillCircle(this.X, this.Y, ranged.Range.Maximum);

        // effective range radius
        game.ctx.fillStyle = "rgba(0, 255, 0, 0.2)";
        game.iso.fillCircle(this.X, this.Y, ranged.Range.Effective);

    },
    drawCorpsePointer: function() {
        if (!this.Corpse || this.Instance == "sanctuary" || (this.Corpse.X == 0 && this.Corpse.Y == 0)) {
            return;
        }

        var dir = new Point(1, 1);
        var p = new Point(this.mount ? this.mount : this);
        var diff = new Point(this.Corpse).sub(p);
        var angle = Math.atan2(diff.y, diff.x);
        dir.rotate(angle).mul(100);
        p.toScreen().add(dir).round();
        Character.corpse.corpse.draw(p);
        // Character.corpse.arrow.draw(p);
    },
    drawBurden: function(burden) {
        var point = this.getDrawPoint();
        var sprite = burden.sprite;
        point.x += this.sprite.width/2 - sprite.width/2;
        point.y -= sprite.height/2;
        burden.sprite.draw(point);
    },
    drawEffects: function() {
        var p = this.getDrawPoint();
        var sp = this.screen();

        for (var name in this.Effects) {
            name = name.toLowerCase();
            var sprite = Character.sprites.effects[name];
            if (!sprite)
                continue;
            p.x = sp.x - sprite.width/2;
            sprite.draw(p);
            sprite.animate(); //TODO: should be animated per character basis;
        }
    },
    drawAura: function() {
        if (config.ui.showAttackRadius && this.sprite.name == "attack")
            this.drawAttackRadius();

        if (this.isPlayer && game.controller.modifier.shift && game.controller.modifier.ctrl) {
            this.drawBowRadius();
        }
    },
    drawUI: function() {
        var marker = this.getQuestMarker();
        if (marker) {
            this.drawMarker(marker, 0.01);
        } else {
            marker = this.getNPCMarker();
            if (marker) {
                this.drawMarker(marker, 0.005);
            }
        }

        if (game.debug.player.box || game.controller.hideStatic()) {
            if (!this.mount)
                this.drawBox();
        }

        // else drawn in controller
        if (this != game.controller.world.hovered && this != game.player.target) {
            this.drawName(undefined, !!marker);
        }

        this.info.forEach(function(info) {
            info.draw();
        });

        if (game.debug.player.position) {
            game.ctx.fillStyle = "#fff";
            var text = "(" + Math.floor(this.X) + " " + Math.floor(this.Y) + ")";
            var x = this.X - game.ctx.measureText(text).width / 2;
            game.drawStrokedText(text, x, this.Y);
        }

        this.drawCorpsePointer();
    },
    drawMarker: function(marker, intensity) {
        this._marker.opacity += this._marker.delta * intensity;

        if (this._marker.opacity >= 1 || this._marker.opacity < 0.7) {
            this._marker.delta = -this._marker.delta;
        }

        var p = this.screen();
        p.x -= marker.width / 2;
        p.y -= this.nameOffset() + marker.height + FONT_SIZE;

        game.ctx.globalAlpha = this._marker.opacity;
        game.ctx.drawImage(marker, p.x, p.y);
        game.ctx.globalAlpha = 1;
    },
    getNPCMarker: function() {
        switch (this.Type) {
        case "charles":
        case "diego":
        case "larisa":
        case "margo":
        case "scrooge":
            return game.loader.loadImage("icons/npcs/" + this.Type + ".png");
        case "vendor":
        case "shot":
        case "bruno":
        case "bertran":
        case "cosmas":
            return game.loader.loadImage("icons/npcs/vendor.png");
        }
        return null;
    },
    getQuestMarker: function() {
        // has owner -> vendor -> no quests
        if (this.Owner)
            return null;
        // 1. yellow (?) -> has "ready" quest
        // 2. yellow (!) -> has "available" quest
        // 3. gray (?) -> has "active" quest

        var active = false;
        for (var name in game.player.ActiveQuests) {
            var questLog = game.player.ActiveQuests[name];
            var quest = questLog.Quest;
            if (quest.End != this.Type)
                continue;
            if (questLog.State == "ready")
                return game.loader.loadImage("icons/quests/ready.png");
            active = active || questLog.State == "active";
        }
        if (this.getAvailableQuests().length > 0)
            return game.loader.loadImage("icons/quests/available.png");
        if (active)
            return game.loader.loadImage("icons/quests/active.png");
        return null;
    },
    drawDst: function() {
        if (this.dst.radius <= 0)
            return;
        var now = Date.now();
        if (this.dst.time + 33 > now) {
            game.ctx.strokeStyle = "#ff0";
            game.ctx.beginPath();
            var x = this.dst.x;
            var y = this.dst.y;
            game.iso.strokeCircle(x, y, this.dst.radius--);
            this.dst.time = now;
        }
    },
    drawBox: function() {
        var p = this.screen();
        game.ctx.strokeStyle = "cyan";
        game.iso.strokeRect(this.leftTopX(), this.leftTopY(), this.Width, this.Height);
        game.iso.strokeCircle(this.X, this.Y, this.Radius);
    },
    getName: function() {
        var name = this.Name;
        if (this.Type == "vendor") {
            return name.substring(1);
        }

        if (this.IsNpc) {
            return TS(this.Name);
        }

        if (this.Title)
            name = TT(this.Title, {name: name});

        if (this.Fame == 10000) {
            name = T("Lord") + " " + name;
        }
        return name;
    },
    inPvp: function() {
        var pvpExpires = new Date(this.PvpExpires * 1000);
        return pvpExpires > Date.now();
    },
    drawName: function(drawHp, drawName) {
        var name = this.getName();

        if (game.controller.modifier.shift) {
            name += " | " + T("Lvl") + ": " + this.Lvl;
            name += " | " + ["♂", "♀"][this.Sex];
        }

        var p = this.screen();
        var y = p.y - this.nameOffset();
        var dy = FONT_SIZE * 0.5;

        if (this.isInteractive())
            drawHp = false;
        else
            drawHp = drawHp || ((!this.IsNpc || game.config.ui.npc) && game.config.ui.hp);

        drawName = drawName || ((!this.IsNpc || game.config.ui.npc) && game.config.ui.name);

        if (this.PvpExpires) {
            var pvpExpires = new Date(this.PvpExpires * 1000);
            var diff = pvpExpires - Date.now();
            // blink when less then 3 sec
            if (diff > 0 && (diff > 3e3 || diff % 1000 < 500)) {
                var pdy = Character.pvpFlag.height;
                if (drawHp)
                    pdy += dy;
                if (drawName)
                    pdy += dy;

                var pvpPoint = new Point(p.x, y);
                pvpPoint.x -= Character.pvpFlag.width/2;
                pvpPoint.y -= pdy*1.25;

                Character.pvpFlag.draw(pvpPoint);
            }
        }

        if (!drawHp && !drawName)
            return;

        var x = p.x - game.ctx.measureText(name).width / 2;

        if (drawHp) {
            var w = 64;
            var arena = ("Arena" in this.Effects) && ("Arena" in game.player.Effects);
            if (arena && this.Citizenship.Faction != game.player.Citizenship.Faction) {
                //full red rect
                game.ctx.fillStyle = '#000';
                var pad = 2;
                game.ctx.fillRect(p.x - w/2 - pad, y - pad, w + 2*pad, dy + 2*pad); //wtf
            }
            if (!config.ui.simpleFonts) {
                game.ctx.fillStyle = '#333';
                game.ctx.fillRect(p.x - w/2-1, y-1, w+2, dy+2); //wtf
            }

            //full red rect
            game.ctx.fillStyle = '#883527';
            game.ctx.fillRect(p.x - w/2, y, w, dy); //wtf

            //green hp
            game.ctx.fillStyle = '#2ea237';
            game.ctx.fillRect(p.x - w/2, y, w * this.Hp.Current / this.Hp.Max, dy); //wtf

            if (this.Domestical && game.controller.modifier.shift) {
                game.ctx.fillStyle = '#333';
                game.ctx.fillRect(p.x - w/2-1, y + dy-1, w+2, dy+2); //wtf

                game.ctx.fillStyle = '#883527';
                game.ctx.fillRect(p.x - w/2, y + dy, w, dy); //wtf

                game.ctx.fillStyle = '#fea237';
                game.ctx.fillRect(p.x - w/2, y + dy, w * this.Fullness.Current / this.Fullness.Max, dy); //wtf
            }

        } else {
            dy = 0;
        }
        if (drawName) {
            var nameColor = "#e2e9ec";
            if (this.Karma < 0 || this.Aggressive)
                nameColor = "#e23624";
            else if (this.isPlayer)
                nameColor = "#caff8c";
            else if (this.IsNpc)
                nameColor = "#ffca8c";

            game.ctx.fillStyle = nameColor;
            game.drawStrokedText(name, x, y - dy / 2);
            var flag = this.flag();
            if (flag)
                flag.draw({x: x - 20, y: y - dy/2  - 14});
        }
    },
    flag: function() {
        if (this.Team)
            return Character.flags[this.Team];
        if (this.Citizenship)
            return Character.flags[this.Citizenship.Faction];
        return null;
    },
    idle: function() {
        return this.Dx == 0 && this.Dy == 0 && this.Action.Name == "";
    },
    sector: function(angle, x, y) {
        var sectors = 2*Math.PI / angle;
        var alpha = Math.atan2(-y, x);
        var sector = Math.round(alpha / angle);
        return (sector + sectors + 1) % sectors;
    },
    animate: function() {
        var animation = "idle";
        var self = (this.mount) ? this.mount : this;
        var position = self.sprite.position;

        if (self.sprite.angle == 0) {
            position = 0;
        } else if (self.sprite.angle == Math.PI/2 && position > 4) {
            position = (position / 2)<<0;
        }

        if (self.Dx || self.Dy) {
            animation = "run";
            var angle = self.sprite.angle;
            var sector = this.sector(angle, self.Dx, self.Dy);
            var multiple = angle / this.sprite.angle;
            position = sector * multiple;
        } else if (this.Effects.Sitting) {
            animation = "sit";
            var seat = Entity.get(this.Effects.Sitting.SeatId);
            if (seat) {
                switch (seat.Orientation) {
                case "w":
                    position = 1; break;
                case "s":
                    position = 3; break;
                case "e":
                    position = 5; break;
                case "n":
                    position = 7; break;
                }
            }
        } else {
            switch (this.Action.Name) {
            case "attack":
            case "dig":
                animation = this.Action.Name;
                break;
            case "defecate":
            case "":
                animation = "idle";
                break;
            default:
                animation = (this.IsNpc) ? "attack" : "craft";
            }
        }

        if (this.mount)
            animation = "ride";

        this.sprite = this.sprites[animation];
        this.sprite.position = position;

        if (!this.sprite.ready) {
            this.loadSprite();
            return;
        }

        var now = Date.now();
        var speed = (this.Speed && this.Speed.Current || 100);

        var spriteSpeed = this.sprite.speed;
        switch (animation) {
        case "run":
            if (this.Type == "player") {
                spriteSpeed = 6500;
            }
            var biom = game.map.biomAt(this.X, this.Y);
            if (biom) {
                speed *= biom.Speed;
            }
            break;
        case "attack":
            spriteSpeed = this.Action.Duration / this.sprite.framesNum;
            if (!this.IsMob)
                spriteSpeed *= 2;
            speed = 1;
            break;
        }

        if (now - this.sprite.lastUpdate > (spriteSpeed / speed)) {
            this.sprite.frame++;
            this.sprite.lastUpdate = now;
        }

        // TODO: remove after sprites update
        if (false) {
            var start = 0, end = 0;
            var current = this.sprite.frames[animation];
            if (Array.isArray(current)) {
                start = current[0];
                end = current[1];
            } else {
                for (var i in this.sprite.frames) {
                    if (animation == i) {
                        end = start + this.sprite.frames[i];
                        break;
                    }
                    start += this.sprite.frames[i];
                }
            }
        } else {
            var start = 0, end = this.sprite.image.width / this.sprite.width;
        }

        if (this.sprite.frame < start || this.sprite.frame >= end) {
            this.sprite.frame = start;
            if (this.Type == "desu")
                this.sprite.lastUpdate = now + util.rand(5, 60) * 60;
        }
    },
    drawAttackRadius: function(position) {
        var p = new Point(this);
        var sector = (position || this.sprite.position) - 1;
        var offset = new Point(CELL_SIZE, 0).rotate(2*Math.PI - sector * Math.PI/4);
        p.add(offset);
        game.ctx.fillStyle = (this.isPlayer) ? "rgba(255, 255, 255, 0.4)" : "rgba(255, 0, 0, 0.2)";
        game.iso.fillCircle(p.x, p.y, CELL_SIZE);
    },
    toggleActionSound: function() {
        if (this.action.name)
            game.sound.stopSound(this.action.name);

        this.action.name = this.Action.Name;

        if (!this.Action.Duration)
            return;

        if (this.action.name in game.sound.sounds)
            game.sound.playSound(this.action.name, 0);
    },
    update: function(k) {
        this.animate();
        if ("Plague" in this.Effects) {
            this.playAnimation({
                up: {
                    name: "plague",
                    width: 64,
                    height: 64,
                    dy: -16,
                    speed: 177,
                }
            });
        }
        if (this.Action) {
            this.updateActionAnimation();
            if (this.Action.Started != this.action.last) {
                this.action.progress = 0;
                this.action.last = this.Action.Started;
                this.toggleActionSound();
                if (this.isPlayer) {
                    dom.show(game.controller.actionProgress);
                    game.controller.actionButton.startProgress();
                }
            }
            if (this.Action.Duration) {
                this.action.progress += (1 / this.Action.Duration * 1000 * k);
            } else {
                if (this.isPlayer) {
                    dom.hide(game.controller.actionProgress);
                    game.controller.actionButton.stopProgress();
                }
                this.action.progress = 0;
            }
        }
        if (this.Mount) {
            if (!this.mount) {
                this.mount = Entity.get(this.Mount);
                if (this.mount)
                    this.mount.rider = this;
            }
        } else {
            if (this.mount) {
                this.mount.rider = null;
                this.mount = null;
            }
        }
        this.updatePosition(k);

        if (this.isPlayer) {
            // clear target if one is disappeared
            if (this.target && !game.entities.has(this.target.Id))
                this.setTarget(null);

            if (config.graphics.autoHideWalls) {
                this.updateBuilding();
            }
            this.updateBar();
        }

        this.info = this.info.filter(function(info) {
            return info.update(k);
        });

        if (this.ballon) {
            this.ballon.update();
        }

    },
    updateBuilding: function() {
        var n = false, w = false, s = false,  e = false;
        var x = this.X;
        var y = this.Y;

        game.entities.forEach(function(b) {
            if (b.Group == "wall" || b.Group == "gate") {
                n = n || (b.Y < y && Math.abs(b.X - x) < b.Width);
                w = w || (b.X < x && Math.abs(b.Y - y) < b.Height);
                s = s || (b.Y > y && Math.abs(b.X - x) < b.Width);
                e = e || (b.X > x && Math.abs(b.Y - y) < b.Height);
            }
        });

        this.inBuilding = (n && w && s && e);
    },
    equipSlot: function(name) {
        return this.Equip[Character.equipSlots.indexOf(name)];
    },
    updateActionButton: function () {
        var button = game.controller.actionButton;
        if (this.burden) {
            button.setAction("drop", () => this.liftStop());
            return;
        }
        var left =  Entity.get(this.equipSlot("left-hand"));
        var right =  Entity.get(this.equipSlot("right-hand"));
        if (is(rangedWeaponp)) {
            button.setAction("shot", () => this.shot());
            return;
        }

        var fishingRod = is(fishingRodp);
        if (fishingRod) {
            button.setAction("fish", () => setCursor("fish", fishingRod, this.fish.bind(this)));
            return;
        }

        var targetable = is(targetablep);
            if (targetable) {
            button.setAction(
                targetable.Group,
                function() {
                    game.controller.cursor.set(
                        targetable,
                        game.controller.mouse.x,
                        game.controller.mouse.y
                    );
                }
            );
            return;
        }

        var [action, cmd, entity] = getAction(right) || getAction(left) || [];
        if (button.action == action) {
            return;
        }

        if (action) {
            button.setAction(action, makeHandler(cmd, entity));
        } else {
            button.reset();
        }

        function is(predicate) {
            if (right && predicate(right)) {
                return right;
            }

            if (left && predicate(left)) {
                return left;
            }

            return null;
        }

        function rangedWeaponp(entity) {
            return "Range" in entity;
        }

        function fishingRodp(entity) {
            return entity.Group == "fishing-rod";
        }

        function targetablep(entity) {
            return _.includes(["dildo", "snowball", "shit"], entity.Group);
        }

        function getAction(entity) {
            if (!entity) {
                return null;
            }
            var action = {
                "taming": ["lasso", "tame"],
                "tool": ["tool", "use-tool"],
                "shovel": ["shovel", "dig"],
                "pickaxe": ["pickaxe", "dig"],
            }[entity.Group];
            return action && action.concat(entity);
        }

        function makeHandler(action, entity) {
            return () => setCursor(action, entity);
        }

        function setCursor(action, entity, callback) {
            var cursor = new Entity(entity.Type);
            cursor.initSprite();
            var icon = entity._icon || entity.icon();
            cursor.Width = CELL_SIZE;
            cursor.Height = CELL_SIZE;
            cursor.Sprite.Dx = 6;
            cursor.Sprite.Dy = 56;
            cursor.sprite.image = icon;
            cursor.sprite.width = icon.width;
            cursor.sprite.height = icon.height;
            game.controller.creatingCursor(cursor, action, callback);
        }

    },
    updateBar: function() {
        var self = this;
        // TODO: refactor
        ["Hp", "Fullness", "Stamina"].map(function(name) {
            var strip = document.getElementById(util.lcfirst(name));
            var param = self[name];
            var value = Math.round(param.Current / param.Max * 100);
            strip.firstChild.style.width = Math.min(100, value) + '%';
            strip.title = name + ": " + util.toFixed(param.Current) + " / " + util.toFixed(param.Max);
            strip.lastChild.style.width = Math.max(0, value - 100) + '%';
        });

        this.updateActionButton();
    },
    fish: function fish(data) {
        var repeat = fish.bind(this);
        var panel = game.panels["fishing"];
        if (!panel) {
            var rating = dom.div("rating");
            var buttons = dom.div("#fishing-buttons");

            dom.append(buttons, makeButtons(["<", "<<", "<<<"], 3));
            dom.append(buttons, makeButtons([">", ">>", ">>>"], 0));

            var playerValue = dom.span("?", "value");
            var playerMeter = dom.tag("meter");
            playerMeter.max = 300;
            playerMeter.style.width = "100%";
            playerMeter.title = T("Player");

            var fishValue = dom.span("?", "value");
            var fishMeter = dom.tag("meter");
            fishMeter.max = 300;
            fishMeter.style.width = "100%";
            fishMeter.title = T("Fish");


            panel = new Panel("fishing", "Fishing", [
                rating,
                dom.img("assets/icons/fishing/fish.png"),
                fishMeter,
                fishValue,
                dom.img("assets/icons/fishing/player.png"),
                playerMeter,
                playerValue,
                dom.hr(),
                buttons,
            ]);
            panel.player = playerMeter;
            panel.fish = fishMeter;
            panel.rating = rating;
            panel.fishValue = fishValue;
            panel.playerValue = playerValue;
        }
        if ("Rating" in data) {
            panel.player.value = +data.Player || 0;
            panel.fish.value = +data.Fish || 0;
            panel.playerValue.textContent = +data.Player || 0;
            panel.fishValue.textContent = +data.Fish || 0;
        }
        if (data.Ok == "fishing-finished") {
            dom.forEach("#fishing-buttons button", function() {
                this.disabled = true;
            });
            panel.hide();
            return null;
        }
        dom.forEach("#fishing-buttons button", function() {
            this.disabled = false;
        });
        panel.show();
        return repeat;


        function makeButtons(actions, offset) {
            return dom.wrap("button-group", actions.map(function(action, index) {
                var button = dom.button(
                    T(action),
                    "",
                    function() {
                        game.network.send("fishing-move", {move: offset + this.move});
                        dom.forEach("#fishing-buttons button", function() {
                            this.disabled = true;
                        });
                    }
                );

                button.move = index;
                button.disabled = true;
                return button;
            }));
        }
    },
    updateEffect: function(name, effect) {
        var id = "effect-" + name;
        var efdiv = document.getElementById(id);
        var hash = JSON.stringify(effect);
        if (efdiv) {
            if (efdiv.hash == hash)
                return;

            dom.clear(efdiv);
            clearInterval(efdiv.interval);
        } else {
            efdiv = dom.div("#" + id);
        }

        efdiv.hash = hash;

        let symbolName = util.stringToSymbol(name);
        var title = TS(symbolName);

        var duration = effect.Duration / 1e6;
        if (duration > 0) {
            var last = new Date(duration - (Date.now() - effect.Added*1000));

            var progress = dom.div("effect-progress");
            efdiv.appendChild(dom.wrap("effect-progress-bg", progress));

            var tick = 66;
            efdiv.interval = setInterval(function() {
                last = new Date(last.getTime() - tick);
                var hours = last.getUTCHours();
                var mins = last.getUTCMinutes();
                var secs = last.getUTCSeconds();
                efdiv.title = sprintf("%s %02d:%02d:%02d\n", title, hours, mins, secs);
                progress.style.width = 100 / (duration / last) + "%";
                if (last <= 0) {
                    clearInterval(efdiv.interval);
                }
            }, tick);
        }

        var stacks = dom.span("", "effect-stacks", T("Stacks"));
        var effectElem = dom.wrap("effect", [
            dom.img("assets/icons/effects/" + symbolName + ".png", "effect-name"),
            stacks,
        ]);

        if (effect.Stacks > 1)
            stacks.textContent = effect.Stacks;

        efdiv.className  = "effect " + EffectDesc.className(name);
        efdiv.name = name;
        efdiv.title = title;
        efdiv.onclick = function() {
            var panel = new Panel("effect-description", title, [new EffectDesc(name)]);
            panel.show();
        };
        efdiv.appendChild(effectElem);

        var effects = document.getElementById("effects");
        effects.appendChild(efdiv);
        this.shownEffects[name] = efdiv;
    },
    removeEffect: function(name) {
        dom.remove(this.shownEffects[name]);
        delete this.shownEffects[name];
    },
    updateEffects: function() {
        if (this.synodProtection()) {
            this.Effects["SynodProtection"] = {Duration: 0};
        } else {
            delete this.Effects["SynodProtection"];
        }

        if (this.Lvl <= 20) {
            this.Effects["NewbieProtection"] = {Duration: 0};
        } else {
            delete this.Effects["NewbieProtection"];
        }

        for(var name in this.shownEffects) {
            if (!this.Effects[name]) {
                this.removeEffect(name);
            }
        }

        for (name in this.Effects) {
            this.updateEffect(name, this.Effects[name]);
        }
    },
    findMovePosition: function(k) {
        var delta = this.Speed.Current * k;
        var cell = game.map.getCell(this.X, this.Y);
        if (cell) {
            delta *= cell.biom.Speed;
        }

        var p = new Point(this);
        var dst = new Point(this.Dst.X, this.Dst.Y);
        var distToDst = p.distanceTo(dst);
        if (distToDst < delta) {
            return dst;
        }

        p.x += this.Dx * delta;
        p.y += this.Dy * delta;

        return p;


        if (!this.Settings.Pathfinding) {
            return p;
        }

        var fields = this.potentialFields();
        var maxPotential = game.potentialAt(fields, p);
        var angleStep = Math.PI / 8;
        var startAngle = Math.atan2(this.Dy, this.Dx) + angleStep;
        var endAngle = startAngle + 2*Math.PI;
        for (var angle = startAngle; angle <= endAngle; angle += angleStep) {
            dst.x = this.X;
            dst.y = this.Y;
            var dx = Math.cos(angle);
            var dy = Math.sin(angle);
            dst.x += dx * delta;
            dst.y += dy * delta;

            var potential = game.potentialAt(fields, dst);
            if (potential - maxPotential > delta) {
                maxPotential = potential;
                p.fromPoint(dst);
                this.Dx = dx;
                this.Dy = dy;
            }
        }

        this._pathHistory.push(new CirclePotentialField(this.X, this.Y, -100, 50));
        if (this._pathHistory.length > 32) {
            this._pathHistory.splice(0, 1);
        }

        return p;
    },
    canCollideNow: function() {
        return true;
    },
    potentialFields: function() {
        var base = 1000;
        var fields = this._pathHistory.slice(0);
        var radius = this.Radius;
        fields.push(new CirclePotentialField(this.Dst.X, this.Dst.Y, 5000, 5));
        game.entities.forEach(function(entity) {
            if (entity == this || !entity.canCollideNow())
                return;

            var field = (entity.round)
                ? new CirclePotentialField(
                    entity.X,
                    entity.Y,
                    -(1 + radius + entity.Radius)*base,
                    base
                )
                : new RectPotentialField(
                    entity.X - entity.Width/2,
                    entity.Y - entity.Height/2,
                    entity.Width,
                    entity.Height,
                    -base * (1 + radius),
                    base/2
                );
            fields.push(field);
        });
        _.forEach(game.map.data, function(row, y) {
            _.forEach(row, function(cell, x) {
                if (cell.biom.Blocked) {
                    fields.push(new RectPotentialField(
                        game.player.Location.X + (x + 0.5) * CELL_SIZE,
                        game.player.Location.Y + (y + 0.5) * CELL_SIZE,
                        CELL_SIZE,
                        CELL_SIZE,
                        -base,
                        base/2
                    ));
                }
            });
        });
        return fields;
    },
    updatePosition: function(k) {
        if (this.mount)
            return;
        if (this.Dx == 0 && this.Dy == 0) {
            return;
        }

        var p = this.findMovePosition(k);
        this.setPos(p.x, p.y);
        if (this.X == this.Dst.X && this.Y == this.Dst.Y) {
            this.stop();
        }

        if (this.isPlayer) {
            game.controller.updateVisibility();
            game.controller.minimap.update();
        }

        this.updatePlow();
    },
    updatePlow: function() {
        if (!this.plow)
            return;
        var p = new Point(this);
        var sector = (this.sprite.position - 1);
        // y = 1 used to fix rendering order
        var offset = new Point(this.plow.Radius, 1).rotate(2*Math.PI - sector * Math.PI/4);
        p.add(offset);
        this.plow.setPoint(p);
        this.plow.sprite.position = this.sprite.position;

        if (this.Dx || this.Dy)
            this.plow.sprite.animate();
    },
    pickUp: function() {
        var self = this;
        var list = game.findItemsNear(this.X, this.Y).filter(function(e) {
            return e.MoveType == Entity.MT_PORTABLE;
        }).sort(function(a, b) {
            return a.distanceTo(self) - b.distanceTo(self);
        });
        if (list.length > 0)
            list[0].pickUp();
    },
    liftStart: function() {
        var self = this;
        var list = game.findItemsNear(this.X, this.Y).filter(function(e) {
            return e.MoveType == Entity.MT_LIFTABLE;
        }).sort(function(a, b) {
            return a.distanceTo(self) - b.distanceTo(self);
        });
        if (list.length > 0)
            list[0].lift();
    },
    liftStop: function() {
        if (this.burden) {
            game.controller.creatingCursor(this.burden, "lift-stop");
        }
    },
    stop: function() {
        this.Dx = 0;
        this.Dy = 0;
        this._pathHistory = [];
    },
    isNear: function(entity) {
        if (entity.belongsTo(game.player))
            return true;
        if (entity.Width) {
            var padding = this.Radius*2;
            return util.rectIntersects(
                entity.leftTopX() - padding,
                entity.leftTopY() - padding,
                entity.Width + padding * 2,
                entity.Height + padding * 2,
                this.leftTopX(),
                this.leftTopY(),
                this.Width,
                this.Height
            );
        }
        var len_x = entity.X - this.X;
        var len_y = entity.Y - this.Y;
        var r = 2*this.Radius + Math.max(entity.Radius, Math.min(entity.Width, entity.Height) / 2) + 1;

        return util.distanceLessThan(len_x, len_y, r);
    },
    drawHovered: function(nameOnly) {
        if (this.Invisible)
            return;

        if (!nameOnly)
            this.sprite.drawOutline(this.getDrawPoint());

        if (this == game.player.target)
            game.setFontSize(17);

        this.drawName(true, true);

        if (this == game.player.target)
            game.setFontSize(0);
    },
    intersects: Entity.prototype.intersects,
    canIntersect: function() {
        return this.sprite.outline != null && (config.ui.allowSelfSelection || this != game.player);
    },
    bag: function() {
        return Entity.get(this.Equip[0]);

    },
    findItems: function(kinds) {
        var found = {};
        kinds.forEach(function(kind) {
            found[kind] = [];
        });
        var entities = [
            this.equipSlot("bag"),
            this.equipSlot("right-hand"),
            this.equipSlot("left-hand"),
        ].map(Entity.get).map(search);

        // TODO: search in recursive containers
        function search(entity) {
            if (!entity)
                return;
            var items = (entity.Props.Slots) ? entity.Props.Slots.map(Entity.get) : [entity];
            items.forEach(function(entity) {
                if (!entity)
                    return;
                kinds.forEach(function(kind) {
                    if (entity.is(kind)) {
                        found[kind].push(entity);
                    }
                });
            });
        }

        return found;
    },
    equippedWith: function(group) {
        return this.Equip
            .filter(Number)
            .map(Entity.get)
            .some(function(item) {
                return (item.Group == group);
            });
    },
    icon: function() {
        if (!this._icon)
            this._icon = this.sprite.icon();
        return this._icon;
    },
    getParts: function() {
        if (this.IsNpc)
            return {};
        var parts = {
            legs: null,
            feet: null,
            body: null,
            hair: null,
            head: null,
        };
        var hideHelmet = this.Style && this.Style.HideHelmet;
        Character.clothes.forEach(function(type, i) {
            parts[type] = {
                name: (type == "head" && hideHelmet) ? "" : this.Clothes[i]
            };
        }.bind(this));

        if (!parts.head.name && this.Style && this.Style.Hair) {
            var hairStyle = this.Style.Hair.split("#");
            parts.hair = {
                name: hairStyle[0],
                color: hairStyle[1],
                opacity: hairStyle[2],
            };
        }
        return parts;
    },
    interact: function() {
        var self = this;
        game.player.interactTarget = this;
        game.network.send("follow", {Id: this.Id}, function interact() {
            switch (self.Type) {
            case "vendor":
                game.controller.vendor.open(self);
                return;
            }

            var quests = self.getQuests();
            if (quests.length > 0 && self.Type == "plato") {
                var quest = new Quest(quests[0], self);
                quest.showPanel();
                return;
            }

            var talks = self.getTalks();
            if (talks.talks.length == 0) {
                Character.npcActions.Quest.call(self);
                return;
            }

            var actions = ["Talk"];

            if (quests.length > 0)
                actions.push("Quest");

            actions = actions.concat(Object.keys(talks.actions));

            if (actions.length == 1) {
                Character.npcActions.Talk.call(self);
                return;
            }

            var panel = new Panel(
                "interraction",
                self.Name,
                actions.map(function(title) {
                    var cls = (title == "Quest") ? "quest-button" : "";
                    return dom.button(T(title), cls, function() {
                        panel.close();
                        Character.npcActions[title].call(self);
                    });
                })
            );
            panel.entity = self;
            panel.show();
        });
    },
    getTalks: function() {
        return Talks.get(
            this.Type,
            game.player.Citizenship.Faction.toLowerCase(),
            game.player.sex()
        );
    },
    sex: function() {
        return Character.sex(this.Sex);
    },
    isInteractive: function() {
        if (this.Type == "vendor")
            return true;
        if (this.getQuests().length > 0)
            return true;
        if (this.Type.toLowerCase() in Talks.npcs)
            return true;
        return false;
    },
    use: function(entity) {
        switch (entity.Group) {
        case "shit":
        case "snowball":
            game.network.send("throw", {Id: this.Id, Item: entity.Id});
            return true;
        case "dildo":
            game.network.send("fuck", {Id: this.Id});
            return true;
        case "spell-scroll":
            game.network.send("cast", {Id: entity.Id, Target: this.Id});
            return true;
        }
        return false;
    },
    canUse: function(entity) {
        if (entity instanceof Character)
            return this.distanceTo(entity) < 2*CELL_SIZE;

        switch (entity.Group) {
        case "shit":
        case "dildo":
        case "snowball":
        case "spell-scroll":
            return true;
        }

        switch (entity.Location) {
        case Entity.LOCATION_IN_CONTAINER:
            var cnt = entity.findRootContainer();
            return cnt && this.canUse(cnt);
        case Entity.LOCATION_EQUIPPED:
            return this.Id == entity.Owner;
        default:
            return this.isNear(entity);
        }
    },
    updateActionAnimation: function() {
        switch (this.Action.Name) {
        case "cast":
            this.playAnimation({
                down: {
                    name: "cast",
                    width: 100,
                    height: 60,
                    dy: -18,
                }
            });
            break;
        }
    },
    // available anims: {up: {...}, down: {...}}
    playAnimation: function(anims) {
        for (var type in anims) {
            if (this.animation[type] == null)
                this.loadAnimation(type, anims[type]);
        }
    },
    loadAnimation: function(type, anim) {
        var sprt = new Sprite(
            "animations/" + anim.name + "-" + type + ".png",
            anim.width,
            anim.height,
            (anim.speed || 80)
        );
        if (anim.dy)
            sprt.dy = anim.dy;

        loader.ready(function() {
            this.animation[type] = sprt;
        }.bind(this));
    },
    distanceTo: function(e) {
        return Math.hypot(this.X - e.X, this.Y - e.Y);
    },
    selectNextTarget: function(p = new Point(this)) {
        var self = this;
        var party = self.Party || [];
        var list = game.findCharsNear(p.x, p.y, 5*CELL_SIZE).filter(function(c) {
            if (c == self)
                return false;
            if (c == self.target)
                return false;
            if (c.Team && c.Team == self.Team)
                return false;
            if (c.IsNpc && !c.IsMob)
                return false;
            return party.indexOf(c.Name) == -1;
        }).sort(function(a, b) {
            return new Point(a).distanceTo(p) - new Point(b).distanceTo(p);
        });
        if (list.length > 0)
            this.setTarget(list[0]);
    },
    setTarget: function(target) {
        this.target = target;
        var cnt = game.controller.targetContainer;
        if (!target) {
            cnt.dataset.targetId = null;
            dom.hide(cnt);
            return;
        }

        if (cnt.dataset.targetId == target.Id)
            return;

        var name = dom.div("#target-name");
        name.textContent = target.getName();
        cnt.dataset.targetId = target.Id;
        dom.clear(cnt);
        cnt.appendChild(target.sprite.icon());
        cnt.appendChild(name);
        dom.show(cnt);
    },
    inspect: function(target) {
        game.network.send("inspect", {Id: target.Id}, function(data) {
            if (!data.Equip)
                return;
            target.Equip = data.Equip;
            var panel = new Panel(
                "inspect",
                target.Name,
                [
                    new Doll(target),
                    dom.wrap("equip", data.Equip.map(function(item, i) {
                        var title = Character.equipSlots[i];
                        var slot = new ContainerSlot({panel: panel, entity: {}}, i);
                        if (item) {
                            var entity = new Entity(item.Type);
                            entity.sync(item);
                            slot.set(entity);
                        }
                        var elem = slot.element;
                        elem.classList.add("equip-" + title);
                        return elem;
                    })),
                ]
            );
            panel.element.classList.add("stats-panel");
            panel.temporary = true;
            panel.show();
        });
    },
    getAvailableQuests: function() {
        return game.player.AvailableQuests[this.Type] || [];
    },
    getQuests: function() {
        var quests =  this.getAvailableQuests();
        for (var id in game.player.ActiveQuests) {
            var quest = game.player.ActiveQuests[id].Quest;
            if (quest.End == this.Type)
                quests.push(quest);
        }
        return quests;
    },
    updateActiveQuest: function() {
        var panel = game.panels.quest;
        if (!panel)
            return;
        panel.setContents(panel.quest.getContents());
    },
    onremove: function() {
    },
    shot: function(x = 0, y = 0) {
        if (!(this.target instanceof Character)) {
            game.controller.showWarning("Select target");
            return;
        }
        game.network.send("waza", {Name: "Shot", Id: this.target.Id, X: x, Y: y});
    },
    onclick: function(x, y) {
        if (game.controller.wantShot()) {
            this.shot(x, y);
        } else {
            this.setDst(x, y);
        }
    },
    armored: function() {
        var armoredMob = _.includes([
            "training-dummy",
            "kitty-pahan",
            "rogalian",
            "hell-rogalian",
            "ufo",
            "red-chopper",
            "blue-chopper",
        ], this.Type);
        if (armoredMob)
            return true;
        var armor = this.Clothes[2];
        return _.includes(["iron", "steel", "titanium", "meteorite", "bloody"], armor);
    },
    synodProtection: function() {
        return this.Z == 0 && this.Karma >= 0 && !this.inPvp();
    },
};
