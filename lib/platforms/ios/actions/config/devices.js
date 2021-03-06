var Q = require('q'),
    chalk = require('chalk'),
    spinner = require("char-spinner"),
    format = require('util').format,
    tarifaFile = require('../../../../tarifa-file'),
    pathHelper = require('../../../../helper/path'),
    print = require('../../../../helper/print'),
    parseProvisionFile = require('../../lib/parse-mobileprovision'),
    downloadProvisioning = require('../../lib/nomad/provisioning/download'),
    getDevices = require('../../lib/nomad/device/list'),
    addDevice = require('../../lib/nomad/device/add'),
    provisioningManager = require('../../lib/nomad/provisioning/device'),
    ask = require('../../../../questions/ask');

function listDevice(verbose) {
    return tarifaFile.parse(pathHelper.root()).then(function (localSettings) {
        if(!localSettings.deploy || !localSettings.deploy.apple_id)
            return Q.reject("No deploy informations are available in the current tarifa.json file.");
        return ask.password('What is your apple developer password?')
            .then(function (password) {
                spinner();
                return getDevices(
                    localSettings.deploy.apple_id,
                    localSettings.deploy.apple_developer_team,
                    password,
                    verbose
                );
            });
    });
}

function listDeviceInProvisioningWithInfo(config, verbose) {
    return tarifaFile.parse(pathHelper.root(), 'ios', config)
        .then(function (localSettings) {
            var localConf = localSettings.configurations.ios[config],
                label = localConf.sign;
            if(!label)
                return Q.reject(format('No `sign` attribute in configuration %s', config));

            var provisioning_path = localSettings.signing.ios[label].provisioning_path;

            return parseProvisionFile(provisioning_path).then(function (provision) {
                var devices = provision.uuids.map(function (uuid){
                    return { name: '', uuid: uuid, enabled: true };
                });
                return {
                    type: provision.type,
                    name: provision.name,
                    devices: devices
                };
            });
        });
}

function printDevices(title, msg) {
    return function (devices) {
        if(title) print(chalk.cyan(title));
        if (devices.length) {
            if(msg) print(msg);
            devices.forEach(function (device) {
                print(
                    "%s %s enabled: %s",
                    chalk.cyan(device.name),
                    chalk.yellow(device.uuid),
                    device.enabled ? chalk.green(device.enabled) : 'false'
                );
            });
        }
    };
}

function list(config, verbose) {
    var cwd = process.cwd(),
        p = config ? listDeviceInProvisioningWithInfo(config, verbose).then(function (provision) {
            var title = format("Provisioning Profile %s with Type: %s", provision.name, provision.type),
                msg = format("\nDevices in configuration: %s", config);
            printDevices(title, msg)(provision.devices);
        }) : listDevice(verbose).then(printDevices("\nAll Devices :"));
    return p.then(function (val) {
        process.chdir(cwd);
        return val;
    }, function (err) {
        process.chdir(cwd);
        throw err;
    });
}

function add(name, uuid, verbose) {
    return tarifaFile.parse(pathHelper.root()).then(function(localSettings) {
        var id = localSettings.deploy.apple_id,
            team = localSettings.deploy.apple_developer_team;

        return ask.password('What is your apple developer password?').then(function (password) {
            spinner();
            return addDevice(id, team, password, name, uuid, verbose)
                .then(function (output) { if(verbose) print(output); });
        });
    });
}

function attach(uuid, config, verbose) {
    var cwd = process.cwd();
    process.chdir(pathHelper.root());
    return tarifaFile.parse(pathHelper.root(), 'ios', config).then(function(localSettings) {
        var id = localSettings.deploy.apple_id,
            team = localSettings.deploy.apple_developer_team,
            conf = localSettings.configurations.ios[config],
            label = conf.sign,
            signing = localSettings.signing.ios[label];

        return ask.password('What is your apple developer password?').then(function (password) {
            return getDevices(id, team, password, verbose).then(function (devices) {
                var rslt = devices.filter(function (id) { return id === uuid; }),
                    profile_path = signing.provisioning_path,
                    profile_name = signing.provisioning_name;

                if(rslt.length) {
                    if(verbose) print.success('device already in developer center');
                    return provisioningManager.add(id, team, password, uuid, profile_path, devices, verbose).then(function () {
                        return downloadProvisioning(id, team, password, profile_name, profile_path, verbose);
                    });
                }
                else {
                    if(verbose) print.success('device not in developer center');
                    return ask.question('Choose your device label').then(function (name) {
                        return addDevice(id, team, password, name, uuid, verbose).then(function (output) {
                            devices.push({ name:name, uuid:uuid, enabled:true });
                            if(verbose) print(output);
                        });
                    }).then(function () {
                        return provisioningManager.add(id, team, password, uuid, profile_path, devices, verbose).then(function () {
                            return downloadProvisioning(id, team, password, profile_name, profile_path, verbose);
                        });
                    });
                }
            });
        });
    }).then(function (val) {
        process.chdir(cwd);
        return val;
    }, function (err) {
        process.chdir(cwd);
        throw err;
    });
}

function detach(uuid, config, verbose) {
    var cwd = process.cwd();
    process.chdir(pathHelper.root());
    return tarifaFile.parse(pathHelper.root(), 'ios', config).then(function (localSettings) {
        var conf = localSettings.configurations.ios[config];
        if(!conf.sign)
            return Q.reject(format("no sign attribute on configuration `%s`", config));

        var label = conf.sign,
            signing  = localSettings.signing.ios[label];

        return ask.password('What is your apple developer password?').then(function (password) {
            var profile_path = signing.provisioning_path,
                profile_name = signing.provisioning_name,
                id = localSettings.deploy.apple_id,
                team = localSettings.deploy.apple_developer_team;
            return parseProvisionFile(profile_path)
                .then(function (provision) {
                    if(provision.uuids.indexOf(uuid) < 0)
                        return Q.reject('device is not included in the provisioning file!');
                    return getDevices(id, team, password, verbose).then(function (devices) {
                        return provisioningManager.remove(id, team, password, uuid, profile_path, devices, verbose);
                    });
                }).then(function () {
                    return downloadProvisioning(id, team, password, profile_name, profile_path, verbose);
                });
        });
    }).then(function (val) {
        process.chdir(cwd);
        return val;
    }, function (err) {
        process.chdir(cwd);
        throw err;
    });
}

module.exports = {
    list : list,
    add: add,
    attach: attach,
    detach: detach
};
