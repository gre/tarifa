var Q = require('q'),
    format = require('util').format,
    settings = require('../../../settings'),
    getAppleDeveloperIdentities = require('../../../ios/apple_developer_identity');

module.exports = function (type) {
    var name = format('%s_apple_developer_identity', type),
        question = function (response, verbose) {
            return getAppleDeveloperIdentities(verbose).then(function (identities) {
                var ids = identities;
                ids.push(settings.default_apple_developer_identity);
                return {
                    dependency: 'ios',
                    type:'list',
                    name: name,
                    choices: ids,
                    default: settings.default_apple_developer_identity,
                    message: format('Which Developer Identity do you take to build the %s distribution?', type)
                };
            });
        };
    question.dependency = 'ios';
    return question;
};