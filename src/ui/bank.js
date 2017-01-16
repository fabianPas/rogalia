/* global game, dom, Vendor, Panel, util, T, TT */

"use strict";

function Bank(npc) {
    var balance = dom.tag("label");
    var price = Vendor.createPriceInput();

    var deposit = dom.button(T("Deposit"), "", () => send("deposit"));
    var withdraw = dom.button(T("Withdraw"), "", () => send("withdraw"));
    var max = dom.button(T("Max"), "", () => maxCurrency());

    function maxCurrency() {
        console.log("Max it");
    }

    function send(action) {
        var cost = price.cost();
        if (cost == 0)
            game.popup.alert(T("Please enter amount"));
        else
            game.network.send(action, {Id: npc.Id, Cost: cost}, callback);
    }

    var claimRent = dom.tag("label");
    var claimPaidTill = dom.tag("label");
    // var claimLastPaid = document.createElement("label");

    var claimGet = dom.button(T("Get claim"), "", function() {
        var cit = game.player.Citizenship;
        var msg = "";
        if (cit.Claims > 0 && cit.Claims >= cit.Rank) {
            msg = T("To build a new claim you must increase your faction rank or destroy old claim") + ". ";
        }
        msg += TT("Get claim for {n} gold?", {n: 8});
        game.popup.confirm(msg, function() {
            game.network.send("get-claim", {}, callback);
        });
    });

    var claimPay = dom.button(T("Pay"), "", function() {
        game.popup.confirm(T("Confirm?"), function() {
            game.network.send("pay-for-claim", {Id: npc.Id}, callback);
        });
    });


    var vault = dom.div("vault");

    var contents = [
        balance,
        dom.hr(),
        price,
        max,
        deposit,
        withdraw,
        dom.hr(),
        dom.make("div", [
            T("Claim"),
            claimRent,
            claimPaidTill,
            claimGet,
            claimPay,
        ]),
        dom.hr(),
        vault,
    ];
    var panel = new Panel("bank", "Bank", contents);
    panel.hide();
    panel.entity = npc;

    game.network.send("get-bank-info", {id: npc.Id}, callback);

    function date(unixtime) {
        return dom.span(
            (unixtime > 0)
                ? util.date.human(new Date(unixtime * 1000))
                : "-"
        );
    }

    function callback(data) {
        if (!data.Bank)
            return callback;
        price.set(0, 0, 0);
        balance.innerHTML = T("Balance") + ": ";
        dom.append(balance, Vendor.createPrice(data.Bank.Balance));

        var claim = data.Bank.Claim;
        claimRent.innerHTML = T("Rent") + ": ";
        dom.append(claimRent, Vendor.createPrice(claim.Cost));


        claimPaidTill.innerHTML = T("Paid till") + ": ";
        dom.append(claimPaidTill, date(claim.PaidTill));

        // claimLastPaid.innerHTML = T("Last paid") + ": ";
        // claimLastPaid.appendChild(date(claim.LastPaid));

        dom.clear(vault);
        dom.setContents(vault, data.Bank.Vault.map(function(vaultSlot, i) {
            var slot = dom.slot();
            if (vaultSlot.Unlocked) {
                var entity = Entity.get(vaultSlot.Id);
                dom.append(slot, entity.icon());
                slot.onclick = function() {
                    Container.show(entity);
                };
            } else {
                slot.classList.add("plus");
                slot.onclick = function() {
                    var cost = Math.pow(100, i);
                    game.popup.confirm(TT("Buy slot for {cost}?", {cost: Vendor.priceString(cost)}), function() {
                        game.network.send("buy-bank-vault-slot", {id: npc.Id}, callback);
                    });
                };
            }
            return slot;
        }));
        // //TODO: remove items on panel close?


        panel.show();
    };
}
