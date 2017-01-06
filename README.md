Rogalia MMO game client available in the browser and on Steam.

- [Steam](store.steampowered.com/app/528460/)
- [Browser](http://rogalia.ru/play)

## Windows build instructions

The Rogalia client requires [Node](https://nodejs.org/en/) to be installed. Currently the LTS suffices.

In the client directory run the following command:
> npm install

When building on Windows, asset symlinks won't work. To set up NTFS hardlinks run the following commands in Git Bash:
> sh scripts/fix-symlinks.sh
> git rm-symlinks


### Webserver

To develop and test the application rapidly run the Rogalia client on a webserver e.g. Apache or NGINX.
Navigate to:
> localhost/index.html

### NW.js executable

To run the client in a Webkit executable [NW.js](https://github.com/nwjs/nw.js) x32 is required.

> Extract the NW.js binary package

> Drag the Rogalia directory, not the package.json itself, on to the NW.js executable (nwjs.exe) in your NW.JS directory.

NOTE: Make sure your Steam client is running in the background.

## Discussion / contact

Join our [Discord](https://discord.gg/eCxFe8w) channel.
