/* global T, Game, localStorage, config */

"use strict";

main();

function main() {
    var args = parseArgs();
    var lang = localStorage.getItem("lang") || defaultLang(args);

    T.init(lang, function() {
        new Game(lang, args);
    });

    function defaultLang(args) {

        // force ru for vk
        if (window.name.indexOf("fXD") == 0) {
            return "ru";
        }

        var lang = args["lang"] || navigator.language.substring(0, 2);
        if (config.ui.language().includes(lang)) {
            return lang;
        }

        return config.ui.language()[0];
    }

    function parseArgs() {
        return document.location.search
            .substring(1)
            .split("&")
            .reduce(function(params, param) {
                var [key, value] = param.split("=");
                params[key] = decodeURIComponent(value);
                return params;
            }, {});
    }
}
