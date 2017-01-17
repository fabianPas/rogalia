/* global game */

"use strict";
function Craft() {
    this.visibleGroups = {};
    this.buildButton = null;
    this.selected = null;
    this.slots = [];
    this.current = {};
    this.requirements = null;

    this.recipes = {};
    this.list = this.createList();

    this.searchInput = null;
    this.searchSlot = this.createSearchSlot();

    this.listWrapper = dom.wrap("#recipe-list-wrapper", [
        this.createSearchField(),
        dom.wrap("#recipe-filters", [this.searchSlot, this.createFilters()]),
        dom.hr(),
        this.list
    ]);

    this.titleElement = dom.div();
    this.ingredientsList = dom.tag("ul", "ingredients-list");

    this.recipeDetails = dom.div("#recipe-details", {text : T("Select recipe")});

    this.history = [];

    this.panel = new Panel(
        "craft",
        "Craft",
        [this.listWrapper, dom.vr(), this.recipeDetails]
    );
    this.panel.hooks.hide = this.cleanUp.bind(this);
    this.panel.hooks.show = function() {
        this.searchInput.focus();
        this.update();
    }.bind(this);

    this.blank = {
        type: null,
        entity: null,
        panel: null,
        canUse: function(entity) {
            for (var group in this.entity.Props.Ingredients) {
                if (entity.is(group)) {
                    return true;
                }
            }
            return false;
        },
        dwim: function(entity) {
            // TODO: handle game.controller.modifier.shift as for containers
            return this.use(entity);
        },
        use: function(entity) {
            if (this.canUse(entity)) {
                game.network.send("build-add", {blank: this.entity.Id, id: entity.Id});
                return true;
            }
            // do now allow using item
            return false;
        },
    };

    this.build = function(e) {
        game.controller.newCreatingCursor(this.blank.type, "build");
        this.panel.hide();
    }.bind(this);

    if (this.searchInput.value != "")
        this.search(this.searchInput.value, true);
}


Craft.prototype = {
    visibleGroups: null,
    recipe: function(type) {
        return Entity.recipes[type];
    },
    render: function(blank) {
        var ingredients = blank.Props.Ingredients;
        var type = blank.Props.Type;
        var recipe = this.recipe(type);
        // if it's an old item which no has no recipe
        if (!recipe)
            return;
        this.titleElement.textContent = TS(type);

        dom.clear(this.ingredientsList);
        var canBuild = true;
        for(var group in ingredients) {
            var has = ingredients[group];
            var required = recipe.Ingredients[group];
            var name = TS(group.replace("meta-", ""));
            var ingredient = Stats.prototype.createParam(
                _.truncate(name, {length: 14}),
                {Current: has, Max: required}
            );
            ingredient.title = name;
            canBuild = canBuild && (has == required);
            this.ingredientsList.appendChild(ingredient);
        }
        this.buildButton.disabled = !canBuild;
    },
    update: function() {
        // update blank after server confirmation of ingredient being added
        if (this.blank.entity)
            this.render(this.blank.entity);

        if (!this.panel.visible)
            return;

        //TODO: we ignore stats updates; fix this
        return;
        //TODO: this is ugly; refactor
        var list = this.createList();
        var st = this.list.scrollTop;
        dom.replace(this.list, list);
        this.list = list;
        this.list.scrollTop = st;
        if (this.current.recipe) {
            dom.append(this.recipeDetails, this.makeRequirements(this.current.recipe));
        }
    },
    open: function(blank, burden) {
        this.blank.entity = blank;
        var panel = this.blank.panel = new Panel("blank-panel", "Build");
        panel.entity = blank;

        var slotHelp = dom.div("", {text :  T("Drop ingredients here") + ":"});

        this.slot = dom.div();
        this.slot.classList.add("slot");
        this.slot.build = true;

        var self = this;
        var recipe = this.recipe(blank.Props.Type);
        var auto = dom.button(T("Auto"), "build-auto", function() {
            var list = [];
            var items = [];
            game.controller.iterateContainers(function(item) {
                items.push(item.entity);
            });
            for (var group in blank.Props.Ingredients) {
                var has = blank.Props.Ingredients[group];
                var required = recipe.Ingredients[group];
                var ok = true;
                while (has < required && ok) {
                    var i = items.findIndex(function(item) {
                        return item.is(group);
                    });
                    if (i != -1) {
                        list.push(items[i].Id);
                        items.splice(i, 1);
                        has++;
                    } else {
                        ok = false;
                    }
                }
            }
            if (list.length > 0)
                game.network.send("build-add", {Blank: blank.Id, List: list});
        });

        this.buildButton = dom.button(T("Build"), "build-button", function(e) {
            game.network.send("build", {id: blank.Id});
            panel.hide();
        });

        panel.setContents([
            this.titleElement,
            dom.hr(),
            slotHelp,
            this.slot,
            dom.hr(),
            this.ingredientsList,
            auto,
            this.buildButton,
        ]);

        this.render(blank);
        panel.show();

        if (burden) {
            this.blank.use(burden);
        }
    },
    use: function(entity, to) {
        if (!entity.is(to.group))
            return false;

        var from = Container.getEntityContainer(entity);
        if (!from)
            return false;

        if (this.slots.some(function(slot) {
            return slot.firstChild.id == entity.id;
        })) {
            return false;
        }
        var slot = from.findSlot(entity);

        slot.lock();
        var ingredient = entity.icon();
        ingredient.id = entity.Id;
        ingredient.unlock = slot.unlock.bind(slot);

        var index = this.slots.indexOf(to);
        this.slots[index].used = true;
        this.slots[index].from = from;
        this.slots[index].unlock = slot.unlock.bind(slot);
        dom.setContents(to, ingredient);
        return true;
    },
    cleanUp: function() {
        for(var i = 0, l = this.slots.length; i < l; i++) {
            var slot = this.slots[i];
            this.cancel(slot.item, slot);
        }
    },
    createList: function() {

        var groups = {};
        _.flatMap(Skills.byAttr).forEach(function(group) {
            groups[group] = {};
        });

        Entity.getSortedRecipeTuples().forEach(function(tuple) {
            var type = tuple[0];
            var recipe = tuple[1];
            groups[recipe.Skill][type] = recipe;
        });

        var onclick = this.onclick.bind(this);
        var list = dom.tag("ul", "recipe-list");
        for (var group in groups) {
            var recipes = groups[group];
            var subtree = dom.tag("ul", (this.visibleGroups[group]) ? "" : "hidden");
            subtree.group = group;

            for (var type in recipes) {
                var recipe = recipes[type];
                var item = dom.tag("li", "recipe");
                item.classList.add(["portable", "liftable", "static"][Entity.templates[type].MoveType]);
                item.recipe = recipe;
                item.title = TS(type);
                item.dataset.search = item.title.toLowerCase().replace(" ", "-");
                item.textContent = item.title;
                item.type = type;
                item.onclick = onclick;
                if (this.selected && this.selected.type == item.type) {
                    item.classList.add("selected");
                    this.selected = item;
                }

                if (!this.safeToCreate(recipe))
                    item.classList.add("unavailable");

                dom.append(subtree, item);
                this.recipes[type] = item;
            }

            if (subtree.children.length == 0)
                continue;

            var subtreeLi = dom.tag("li");
            var groupToggle = dom.span(T(group), "group-toggle");
            var visibleGroups = this.visibleGroups;
            groupToggle.subtree = subtree;
            groupToggle.onclick = function() {
                dom.toggle(this);
                visibleGroups[this.group] = !this.classList.contains("hidden");
            }.bind(subtree);

            var icon = new Image();
            icon.src = "assets/icons/skills/" + group.toLowerCase() + ".png";

            dom.append(subtreeLi, [icon, groupToggle, subtree]);
            dom.append(list, subtreeLi);
        }

        if (list.children.length == 0)
            list.textContent = "You have no recipes";

        return list;
    },
    createSearchField: function() {
        var input = dom.tag("input");
        input.placeholder = T("search");
        input.addEventListener("keyup", this.searchHandler.bind(this));
        input.value = localStorage.getItem("craft.search") || "";

        this.searchInput = input;

        var reset = this.search.bind(this, "");
        var clear = dom.button("×", "recipe-search-clear", function() {
            reset();
            input.value = "";
            input.focus();
        });
        clear.title = T("Clear search");

        var label = dom.tag("label", "recipe-search");
        dom.append(label, [input, clear]);

        return label;
    },
    createSearchSlot: function() {
        var self = this;
        var slot = dom.slot();
        slot.title = T("Search by ingredient");
        slot.canUse = function() {
            return true;
        };
        slot.use = function(entity) {
            slot.entity = entity;
            dom.clear(slot);
            slot.appendChild(entity.icon());
            var searching = self.list.classList.contains("searching");
            self.list.classList.add("searching");
            for (var type in self.recipes) {
                var li = self.recipes[type];
                if (searching && !li.classList.contains("found"))
                    continue;

                li.classList.remove("found");
                var recipe = Entity.recipes[type];
                for (var ingredient in recipe.Ingredients) {
                    if (entity.is(ingredient)) {
                        li.classList.add("found");
                        li.parentNode.parentNode.classList.add("found");
                        continue;
                    }
                }
            }
            dom.forEach(".recipe-list > .found", function() {
                if (this.querySelector(".found") == null)
                    this.classList.remove("found");
            });
            return true;
        };
        slot.addEventListener("mousedown", function() {
            slot.entity = null;
            dom.clear(slot);
            self.search(self.searchInput.value);
        }, true);

        return slot;
    },
    createFilters: function() {
        var recipeList = this.list;
        return dom.wrap("craft-filters", ["portable", "liftable", "static", "unavailable"].map(function(name) {
            var label = dom.tag("label", "", {title: T(name)});
            var checkbox = dom.checkbox();
            var saved = localStorage.getItem("craft.filter." + name);
            checkbox.checked = (saved) ? JSON.parse(saved) : true;
            if (!checkbox.checked)
                recipeList.classList.add("filter-" + name);

            checkbox.onchange = function(e) {
                var checked = !recipeList.classList.toggle("filter-"+name);
                localStorage.setItem("craft.filter." + name, checked);
            };
            dom.append(label, checkbox);
            return label;
        }));
    },
    searchHandler: function(e) {
        // skip selection
        if (e.shiftKey && e.keyCode < 65 || e.key == "Shift") {
            return true;
        }
        return this.search(e.target.value);
    },
    searchOrHelp: function(pattern) {
        var help = Craft.help[pattern];
        if (help) {
            // we need to defer panel showing because searchOrHelp will be called from click handler
            // which will focus previous panel
            _.defer(function() {
                new Panel("craft-help", T("Help"), [dom.span(help)]).show();
            });
        } else if (pattern && pattern.match(/-wall-plan$/)) {
            _.defer(function() {
                game.controller.shop.search(pattern);
            });
        } else {
            this.search(pattern, true);
        }
    },
    search: function(pattern, selectMatching) {
        // we do not want to show on load
        if (game.stage.name == "main")
            this.panel.show();
        //TODO: fast solution; make another one
        var id = "#" + this.panel.name + " ";
        dom.removeClass(id + ".recipe-list .found", "found");
        if (!pattern) {
            this.list.classList.remove("searching");;
            if (this.searchSlot.entity) {
                this.searchSlot.use(this.searchSlot.entity);
            }
            return;
        }
        this.list.classList.add("searching");

        pattern = pattern.toLowerCase().replace(" ", "-");
        try {
            var selector = id + ".recipe[type*='" + pattern + "']," +
                    id + ".recipe[data-search*='" + pattern + "']";
            dom.addClass(selector, "found");
        } catch(e) {
            return;
        }

        this.searchInput.value = (selectMatching) ? TS(pattern) : pattern;

        var matching = null;
        dom.forEach(id + ".recipe.found", function() {
            if (selectMatching && (this.type == pattern || this.dataset.search == pattern)) {
                selectMatching = false;
                matching = this;
            }
            this.parentNode.parentNode.classList.add("found");
        });

        if (this.searchSlot.entity) {
            this.searchSlot.use(this.searchSlot.entity);
        }

        if (matching) {
            this.openRecipe(matching, false);
        }
    },
    onclick: function(e) {
        if (!e.target.recipe)
            return;

        if (game.controller.modifier.shift) {
            game.chat.linkRecipe(e.target.type);
            return;
        }
        if (game.player.IsAdmin && game.controller.modifier.ctrl) {
            game.controller.newCreatingCursor(e.target.type);
            return;
        }
        this.openRecipe(e.target, true);
    },
    openRecipe: function(target, clearHistory, noHistory) {
        var recipe = target.recipe;
        target.classList.add("selected");

        if (this.selected)
            this.selected.classList.remove("selected");

        if (clearHistory) {
            this.history = [];
        } else if (this.selected && !noHistory) {
            this.history.push(this.selected);
        }

        this.selected = target;

        this.cleanUp();
        this.current = {
            recipe: recipe,
            type: target.type,
            title: target.title
        };

        var template = Entity.templates[target.type];
        if (template.MoveType == Entity.MT_PORTABLE)
            this.renderRecipe();
        else
            this.renderBuildRecipe(target);
    },
    renderRecipe: function() {
        var self = this;
        dom.clear(this.recipeDetails);
        this.requirements = null;
        this.slots = [];

        var recipe = this.current.recipe;

        var title = dom.span(T(this.current.title), "recipe-title");
        if (recipe.Output)
            title.textContent += " x" + recipe.Output;
        this.type = this.current.type;
        var ingredients = dom.tag("ul");
        var slots = [];

        for(var group in recipe.Ingredients) {
            var groupTitle = TS(group);
            var required = T(recipe.Ingredients[group]);
            var ingredient = dom.make("li", [required, "x ", this.makeLink(group)]);
            dom.append(ingredients, ingredient);

            for(var j = 0; j < required; j++) {
                var slot = dom.slot();
                var image = Entity.getPreview(group);

                image.title = groupTitle;
                slot.image = image;
                slot.item = null;
                slot.appendChild(image);
                slot.title = groupTitle;
                slot.group = group;
                slot.craft = true; //TODO: fix; required for controller (apply "use")
                slot.used = false;
                slots.push(slot);
                slot.check = function(cursor) {
                    return cursor.entity.is(this.group);
                };
                slot.onmousedown = function() {
                    var slot = this;
                    if (game.controller.cursor.isActive())
                        return;

                    if (slot.from) {
                        self.cancel(this.from, slot);
                        return;
                    }

                    self.searchOrHelp(slot.group);
                }.bind(slot);
            }
        }

        this.slots = slots;

        var auto = dom.button(T("Auto"), "recipe-auto", () => game.controller.iterateContainers((slot) => this.dwim(slot)));
        var create = dom.button(T("Create"), "recipe-create", () => this.create());
        var all = dom.button(T("Craft all"), "recipe-craft-all", () => this.craftAll());
        var buttons = dom.wrap("#recipe-buttons", [all, auto, create]);

        dom.append(this.recipeDetails, [
            this.makePreview(this.current.type),
            title,
            dom.hr(),
            this.makeRequirements(recipe),
            dom.hr(),
            T("Ingredients") + ":",
            ingredients,
            this.makeInfo(this.current.type),
            this.makeEquipRequirementes(this.current.type),
            dom.wrap("#recipe-slost", slots),
            dom.hr(),
            buttons,
            dom.hr(),
            Entity.templates[this.current.type].makeDescription()
        ]);
        this.renderBackButton();
    },
    renderBuildRecipe: function(target) {
        var recipe = target.recipe;
        dom.clear(this.recipeDetails);

        var title = dom.span(target.title, "recipe-title");

        this.blank.type = target.type;

        var ingredients = dom.tag("ul");
        var slots = [];
        for(var name in recipe.Ingredients) {
            var required = recipe.Ingredients[name];
            var group = name.replace("meta-", "");
            var ingredient = dom.make("li", [required, "x ", this.makeLink(group)]);
            dom.append(ingredients, ingredient);
        }
        dom.append(
            this.recipeDetails,
            [
                this.makePreview(this.blank.type),
                title,
                dom.hr(),
                this.makeRequirements(recipe),
                ingredients,
                dom.hr(),
                dom.button(T("Create"), "recipe-create", this.build.bind(this)),
                dom.hr(),
                Entity.templates[this.current.type].makeDescription(),
            ]
        );
        this.renderBackButton();
    },
    renderBackButton: function() {
        if (this.history.length == 0)
            return;

        var self = this;

        dom.append(this.recipeDetails, [
            dom.hr(),
            dom.button(T("Back"), "craft-history-back", function() {
                self.openRecipe(self.history.pop(), false, true);
            }),
        ]);
    },
    craftAll: function() {
        game.controller.iterateContainers((slot) => this.dwim(slot));
        this.create(true);
    },
    create: function(craftAll) {
        var ingredients = [];
        for(var i = 0, l = this.slots.length; i < l; i++) {
            var ingredient = this.slots[i].firstChild;
            if (!ingredient.id)
                return false;
            ingredients.push(parseInt(ingredient.id));
        }
        var done = function (data) {
            this.cleanUp();
            this.renderRecipe();
            if (craftAll === true)
                setTimeout(this.craftAll.bind(this), 100);
        }.bind(this);

        game.network.send("craft", {type: this.type, ingredients: ingredients}, done);
        return true;
    },
    cancel:  function(from, to) {
        var index = this.slots.indexOf(to);
        var slot = this.slots[index];
        slot.used = false;
        slot.from = null;
        slot.unlock && slot.unlock();
        dom.clear(to);
        to.appendChild(to.image);
    },
    safeToCreate: function(recipe) {
        if (!recipe.Lvl)
            return true;
        var skill = game.player.Skills[recipe.Skill];
        if (!skill)
            game.error("Skill not found", recipe.Skill);
        return skill.Value.Current >= recipe.Lvl;
    },
    makeRequirements: function(recipe) {
        return dom.wrap("", [
            T("Requirements") + ": ",
            dom.make("ul", [
                this.makeSkill(recipe),
                this.makeTool(recipe),
                this.makeEquipment(recipe),
                this.makeLiquid(recipe),
            ]),
        ]);
    },
    makeInfo: function(type) {
        var tmpl = Entity.templates[type];
        if ("Armor" in tmpl) {
            return dom.wrap("", [
                dom.hr(),
                T("Base armor") + ": " + tmpl.Armor,
            ]);
        }
        if ("Damage" in tmpl) {
             return dom.wrap("", [
                dom.hr(),
                 T("Base damage") + ": " + tmpl.Damage,
                 tmpl.Ammo && dom.wrap("", T("Ammo") + ": " + T(tmpl.Ammo.Type)),
            ]);
        }
        return null;
    },
    makeEquipRequirementes: function(type) {
        let tmpl = Entity.templates[type];
        if (tmpl.EffectiveParam) {
            var canEquip = tmpl.nonEffective() ? "unavailable" : "";

            return dom.wrap("equip-requirements", [
                dom.wrap(canEquip, T("Requirements") + ": " + T(tmpl.EffectiveParam).toLowerCase() + ": " + tmpl.Lvl),
                dom.hr(),
            ]);
        }
        return null;
    },
    makeSkill: function (recipe) {
        if (!recipe.Skill) {
            return null;;
        }

        var safeToCreate = this.safeToCreate(recipe);

        var title = "";
        if (!safeToCreate) {
            if (recipe.IsBuilding)
                title = T("Cannot complete building");
            else
                title = T("High chance of failing");
        }

        var lvl = (recipe.Lvl > 0) ? recipe.Lvl : "";

        return dom.tag(
            "li",
            (safeToCreate) ? "" : "unavailable",
            {
                title : title,
                text : sprintf("%s: %s %s", T("Skill"), T(recipe.Skill), lvl),
            }
        );
    },
    makeTool : function (recipe) {
        if (!recipe.Tool) {
            return null;
        }
        return dom.append(
            dom.tag("li", "", {text : T("Tool") + ": ", title : T("Must be equipped")}),
            this.makeLinks(recipe.Tool)
        );
    },
    makeEquipment: function (recipe) {
        if (!recipe.Equipment) {
            return null;
        }
        return dom.append(
            dom.tag(
                "li",
                "",
                {
                    text : T("Equipment") + ": ",
                    title : T("You must be near equipment")
                }
            ),
            this.makeLinks(recipe.Equipment)
        );
    },
    makeLiquid: function (recipe) {
        if (!recipe.Liquid) {
            return null;
        }
        return dom.tag(
            "li",
            "",
            {
                text : TS(recipe.Liquid.Type) + " : " + recipe.Liquid.Volume
            }
        );
    },
    makeLink: function(item) {
        if(!item) {
            return null;
        }
        var title = TS(item);
        var link = dom.link("", title, "link-item");
        var self = this;
        link.onclick = function() {
            self.searchOrHelp(item);
        };
        return link;
    },
    makeLinks: function (s) {
        if (!s)
            return [];
        var self = this;

        return util.intersperse(s.split(",").map(this.makeLink.bind(this)), ", ");
    },
    makePreview: function(type) {
        var preview = Entity.templates[type].icon();
        preview.id = "item-preview";
        return dom.wrap("preview-wrapper", preview);
    },
    dwim: function(slot) {
        var self = this;
        if (!this.panel.visible)
            return false;

        if (slot.locked)
            return false;
        if (!slot.entity) {
            console.log("dwimCraft: got empty slot");
            return false;
        }
        var entity = slot.entity;

        // skip non-empty containers
        if (entity.isContainer() && _.some(entity.Props.Slots))
            return false;

        return this.slots.some(function(slot) {
            if (slot.used || !entity.is(slot.group))
                return false;
            self.use(entity, slot);
            return true;
        });
    },
    save: function() {
        localStorage.setItem("craft.search", this.searchInput.value);
    },
};
