const path = require("node:path");
module.exports = {
  packagerConfig: {
    name: "Ngertiin Dev",
    executableName: "Ngertiin Dev",
    appBundleId: "in.ngertiin.dev",
    icon: path.join(__dirname, "dist/app"),
    asar: true,
    prune: false,
    extraResource: [
      path.join(__dirname, "../../.dev/desktop-stage/runtime"),
      path.join(__dirname, "../../.dev/desktop-stage/web"),
    ],
    ignore: (file) => file !== "" && !/^\/(?:dist(?:\/|$)|package\.json$)/.test(file),
  },
  makers: [],
};
