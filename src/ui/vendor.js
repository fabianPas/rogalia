/* global game, dom, TS, T */

"use strict";
function Vendor() {
}

Vendor.priceString = function(cost) {
        cost = parseInt(cost) || 0;

    var negative = false;
    if (cost < 0) {
        negative = true;
        cost = -cost;
    }

    var s = cost % 100;
    cost -= s;
    cost /= 100;
    var g = cost % 100;
    cost -= g;
    cost /= 100;
    var p = cost;
    var price = "";
    if (p) {
        price += p + "p ";
    }
    if (g) {
        price += g + "g ";
    }
    if (s) {
        price += s + "s";
    }
    return price;
};

Vendor.createPrice = function(cost) {
    cost = parseInt(cost) || 0;

    var negative = false;
    if (cost < 0) {
        negative = true;
        cost = -cost;
    }

    var s = cost % 100;
    cost -= s;
    cost /= 100;
    var g = cost % 100;
    cost -= g;
    cost /= 100;
    var p = cost;

    var silver = dom.span(s + "s", "silver", T("Silver"));
    var gold = dom.span(g + "g", "gold", T("Gold"));
    var platinum = dom.span(p + "p", "platinum", T("Platinum"));

    var price = dom.span("", "price");
    if (negative)
        price.classList.add("negative");
    dom.append(price, [platinum, gold, silver]);
    return price;
};

Vendor.createPriceInput = function() {
    var platinum = dom.tag("input", "platinum", {title: T("Platinum")});
    platinum.type = "number";
    platinum.min = 0;
    platinum.value = 0;

    var gold = dom.tag("input", "gold", {title: T("gold")});
    gold.type = "number";
    gold.min = 0;
    gold.value = 0;

    var silver = dom.tag("input", "silver", {title: T("Silver")});
    silver.type = "number";
    silver.min = 0;
    silver.value = 0;

    var price = dom.div("price");
    dom.append(price, [platinum, "p", gold, "g", silver, "s"]);

    price.cost = function() {
        return parseInt(platinum.value || 0) * 10000 +
            parseInt(gold.value || 0) * 100 +
            parseInt(silver.value || 0);
    };

    price.set = function(plt, gld, slv) {
        platinum.value = plt;
        gold.value = gld;
        silver.value = slv;
    };

    price.setTypeValue = function(type, value) {
        switch(type) {
            case "platinum":
                platinum.value = value;
                break;
            case "gold":
                gold.value = value;
                break;
            case "silver":
                silver.value = value;
                break;
        }
    };

    return price;
};

Vendor.sort = new function() {
    var self = this;
    this.byType = function(a, b) {
        if (a.Type != b.Type)
            return (a.Type > b.Type) ? +1 : -1;
        else
            return self.byQuality(a, b);
    };
    this.byQuality = function(a, b) {
        if (a.Quality != b.Quality)
            return b.Quality - a.Quality;
        else
            return self.byPrice(a, b);
    };
    this.byPrice = function(a, b) {
        return b.Cost - b.Cost;
    };
};

Vendor.prototype = {
    panel: null,
    vendor: null,
    items: {},
    open: function(vendor) {
        var self = this;
        this.vendor = vendor;
        this.tabs = this.tabs = [
            {
                title: T("Buy from"),
                update: function(title, contents) {
                    game.network.send("buy-list", {Vendor: self.vendor.Id}, function(data) {
                        dom.setContents(contents, self.buyView(data.Lots));
                    });
                }
            },
            {
                title: T("Sell to"),
                update: function(title, contents) {
                    game.network.send("sell-list", {Vendor: self.vendor.Id}, function(data) {
                        dom.setContents(contents, self.sellView(data.Lots));
                    });
                }
            },
        ];

        if (this.vendor.Type == "vendor" && this.vendor.Owner == game.player.Id) {
            this.tabs.push({
                title: T("Manage"),
                contents: this.manageView(),
            });
        }

        this.panel = new Panel("vendor", TT("Vendor of {name}", {name: vendor.Name}), [dom.tabs(this.tabs)]);
        this.panel.entity = vendor;
        // this.panel.temporary = true;
        this.panel.hooks.hide = this.removeItems.bind(this);
        this.panel.show();
    },
    buyView: function(lots) {
        if (!lots)
            return T("Vendor is empty");
        var self = this;
        return dom.wrap("lot-table", dom.table(
            ["", T("Name"), T("Quality"), T("Cost"), "", ""],
            lots.sort(Vendor.sort.byType).map(function(lot) {
                var name = TS(lot.Type);
                return [
                    dom.wrap("slot", [Entity.templates[lot.Type].icon()]),
                    name,
                    lot.Quality,
                    Vendor.createPrice(lot.Cost),
                    dom.button("?", "lot-info", function(e) {
                        var item = Entity.get(lot.Id);
                        if (item) {
                            self.showInfo(item);
                            return;
                        }
                        game.network.send(
                            "lot-info",
                            {Id: lot.Id, Vendor: self.vendor.Id},
                            function(data) {
                                self.saveItems(data.Lots);
                                self.showInfo(Entity.get(lot.Id));
                            }
                        );
                    }),
                    dom.button(T("Buy"), "lot-buy", function(e) {
                        game.popup.confirm(T("Buy") + " " + name + "?", function() {
                            game.network.send(
                                "buy",
                                {Id: lot.Id, Vendor: self.vendor.Id},
                                function() {
                                    dom.remove(e.target.parentNode.parentNode);
                                }
                            );
                        });
                    }),
                ];
            })
        ));
    },
    sellView: function(lots) {
        if (!lots)
            return T("Vendor is empty");
        var self = this;
        return dom.wrap("lot-table", dom.table(
            ["", T("Name"), T("Quantity"), T("Cost"), "", ""],
            lots.sort(Vendor.sort.byType).map(function(lot) {
                var canBeSold = Vendor.canBeSold(lot.Type);
                var slot = dom.slot();
                slot.check = function(cursor) {
                    return cursor.entity.is(lot.Type);
                };
                slot.canUse = function() {
                    return true;
                };
                slot.use = function(entity) {
                    slot.entity = entity;
                    dom.setContents(slot, entity.icon());
                    button.disabled = false;
                    return true;
                };
                slot.cleanup = function() {
                    slot.entity = null;
                    button.disabled = (canBeSold.length == 0);
                    dom.clear(slot);
                };
                slot.addEventListener("mousedown", slot.cleanup, true);

                var quantity = dom.span(lot.Quantity);
                function cleanup(_, sold) {
                    sold = sold || 1;
                    lot.Quantity -= sold;
                    if (lot.Quantity == 0)
                        dom.remove(slot.parentNode.parentNode);
                    else
                        quantity.textContent = lot.Quantity;

                    canBeSold = Vendor.canBeSold(lot.Type);
                    slot.cleanup();
                }
                var button = dom.button(T("Sell"), "lot-sell", function(e) {
                    if (slot.entity) {
                        game.network.send(
                            "sell",
                            {Vendor: self.vendor.Id, Id: slot.entity.Id},
                            cleanup
                        );
                        return;
                    }
                    Vendor.sellPrompt(
                        canBeSold,
                        {Vendor: self.vendor.Id},
                        cleanup
                    );
                });
                button.disabled = (canBeSold.length == 0);

                var cancel = dom.button("×", "lot-cancel", function() {
                    game.network.send(
                        "undo-buy",
                        {Type: lot.Type, Vendor: self.vendor.Id},
                        cleanup
                    );
                });
                cancel.title = T("Cancel buying and return money");

                return [
                    dom.wrap("slot", [Entity.templates[lot.Type].icon()]),
                    TS(lot.Type),
                    quantity,
                    Vendor.createPrice(lot.Cost),
                    slot,
                    dom.wrap("", [
                        self.vendor.Owner == game.player.Id &&  cancel,
                        button
                    ]),
                ];
            })
        ));
    },
    manageView: function() {
        var self = this;
        return [
            T("Sell"),
            dom.wrap("manage-vendor-row", this.manageBuy()),
            dom.hr(),
            T("Buy up"),
            dom.wrap("manage-vendor-row", this.manageSell()),
            dom.hr(),
            dom.button(T("Take revenue"), "", function() {
                game.network.send("take-revenue", {Vendor: self.vendor.Id});
            }),
            dom.button(T("Take sold items"), "", function() {
                game.network.send("take-sold-items", {Vendor: self.vendor.Id});
            }),
        ];
    },
    manageBuy: function() {
        var self = this;
        var price = Vendor.createPriceInput();
        var slot = dom.slot();

        var button = dom.button(T("Sell"), "", function() {
            game.network.send(
                "buy-add",
                {
                    Id: parseInt(slot.entity.Id),
                    Cost: price.cost(),
                    Vendor: self.vendor.Id
                },
                slot.cleanup.bind(slot)
            );
        });
        button.disabled = true;

        slot.canUse = function() {
            return true;
        };
        slot.use = function(entity) {
            slot.entity = entity;
            dom.setContents(slot, entity.icon());
            button.disabled = false;
            return true;
        };
        slot.cleanup = function() {
            slot.entity = null;
            button.disabled = true;
            dom.clear(slot);
        };
        slot.addEventListener("mousedown", slot.cleanup, true);

        var burden = dom.button(T("Use burden"), "", function() {
            if (game.player.burden)
                slot.use(game.player.burden);
        });
        burden.disabled = !game.player.burden;

        return [
            dom.wrap("lot-item", [slot, price]),
            dom.wrap("lot-controlls", [burden, button]),
        ];
    },
    manageSell: function() {
        var self = this;
        var price = Vendor.createPriceInput();
        var slot = dom.slot();

        var quantity = dom.input(T("Quantity"), 1);
        quantity.label.className = "lot-quantity";
        var button = dom.button(T("Buy up"), "", function() {
            game.network.send(
                "sell-add",
                {
                    Type: slot.entity.Type,
                    Cost: price.cost(),
                    Quantity: +quantity.value,
                    Vendor: self.vendor.Id
                },
                slot.cleanup.bind(slot)
            );
        });
        button.disabled = true;

        slot.canUse = function() {
            return true;
        };
        slot.use = function(entity) {
            slot.entity = entity;
            dom.setContents(slot, entity.icon());
            button.disabled = false;
            return true;
        };
        slot.cleanup = function() {
            slot.entity = null;
            button.disabled = true;
            dom.clear(slot);
        };
        slot.addEventListener("mousedown", slot.cleanup, true);

        return [
            dom.wrap("lot-item", [slot, price]),
            dom.wrap("lot-controlls", [quantity.label, button]),
        ];
    },
    showInfo: function(item) {
        item.showInfo();
        if (item.isContainer())
            Container.show(item);
    },
    saveItems: function(items) {
        for (var id in items) {
            this.items[id] = items[id];
        }
        Entity.sync(items);
    },
    removeItems: function() {
        _.forEach(this.items, (_, id) => game.removeEntityById(id));
        this.items = {};
    }
};

Vendor.canBeSold = function(type) {
    var list = [];
    Container.forEach(function(container) {
        if (!container.entity.belongsTo(game.player))
            return;
        container.forEach(function(slot) {
            var entity = slot.entity;
            if (entity && entity.Type == type) {
                list.push(entity);
            }
        });
    });
    return list;
};

Vendor.sellPrompt = function(items, args, callback) {
    var quantity = dom.input(T("Quantity"), items.length, "number");
    quantity.min = 1;
    quantity.max = items.length;
    quantity.style.width = "auto";
    var sell = dom.button(T("Sell"));
    sell.onclick = function() {
        var list = items.slice(0, quantity.value).map(function(entity) {
            return entity.Id;
        });
        prompt.hide();
        args.List = list;
        game.network.send("sell", args, function(data) {
            callback(data, list.length);
        });
    };
    var prompt = new Panel("prompt", T("Sell"), [quantity.label, sell]);
    prompt.show();

};
