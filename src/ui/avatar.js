/* global dom, ParamBar, game, T */

"use strict";

class Avatar {
    constructor(character) {
        this.character = character;

        this.avatar = character.avatar();
        this.avatar.classList.add("avatar-image");

        this.effects = dom.wrap("avatar-effects");
        const params = (character.isPlayer) ? ["Hp", "Fullness", "Stamina"] : ["Hp"];
        this.bars = params.map(param => new ParamBar(param));
        const contents = dom.wrap("avatar-contents", [
            this.avatar,
            dom.wrap("avatar-info", [
                dom.wrap(
                    "avatar-name",
                    [character.getName()].concat(this.bars.map(bar => bar.element))
                ),
            ]),
        ]);

        contents.onmousedown = (e) => this.onmousedown(e);

        this.element = dom.wrap("avatar-container", [contents, this.effects]);

        if (character.isPlayer) {
            this.element.classList.add("avatar-player");
        }
    }

    setIcon(name) {
    }

    update() {
        this.bars.forEach(bar => {
            const param = this.character[bar.name];
            if (param) {
                bar.update(param);
            }
        });
    }

    onmousedown(e) {
        e.stopPropagation();
        if (this.character.IsNpc) {
            return game.menu.show(this.character);
        }

        if (!this.character.isPlayer) {
            return game.chat.nameMenu(e, this.character.Name);
        }

        switch (e.button) {
        case game.controller.LMB:
            game.controller.stats.panel.toggle();
            break;
        case game.controller.RMB:
            var actions = {};
            if (game.player.Party) {
                actions.leaveParty = function() {
                    game.chat.send("*part");
                };
            }
            actions.suicide = function() {
                game.popup.confirm(T("Commit suicide?"), () => game.chat.send("*suicide"));
            };
            actions.unstuck = function() {
                game.chat.send("*unstuck");
            };
            actions.returnHome = function() {
                game.network.send("return-home");
            };
            game.menu.show(actions);
            break;
        }
        return true;
    }
}
