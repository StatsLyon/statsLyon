/**
 * StationController
 *
 * @description :: Server-side logic for managing Stations
 * @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
 */

const requestHelpers = require('request-helpers');
const removeAccents  = require('remove-accents');
const velovStation = sails.config.mappings.indexes.lyon.types.velovStation;

module.exports = {

  index: function (req, res) {
    const parametersBlueprint = [
      {
        param   : 'query',
        cast    : 'string',
        required: false
      },
      {
        param   : 'id',
        cast    : 'integer',
        required: false
      }
    ];

    var parameters = requestHelpers.secureParameters(parametersBlueprint, req);

    if (!parameters.isValid()) {
      return res.badRequest('No valid parameters.')
    }

    parameters = parameters.asObject();

    const elasticSearch = ElasticSearchService.instance;

    if (parameters.id > 0) {
      return elasticSearch.search({
        index: 'lyon',
        type : velovStation.type,
        size : 1,
        body : {
          query: {
            match: {
              stationID: parameters.id
            }
          }
        }
      })
        .then(response => {
          if (response.hits.hits[0]) {
            return res.ok(response.hits.hits[0]);
          }
          res.ok({});
        })
        .catch(error => {
          sails.log.error(error);
          res.serverError(500, error);
        });
    }

    const fields = ['name.folded', 'town.folded'];

    if (Number.isInteger(parseInt(parameters.query))) {
      fields.push('stationID.whitespaced');
    }

    elasticSearch.search({
      index: 'lyon',
      type : velovStation.type,
      size : 10,
      body : {
        query: {
          bool: {
            should: [
              {
                multi_match: {
                  type  : 'most_fields',
                  query : parameters.query,
                  fields: fields
                }
              },
              {
                multi_match: {
                  type  : 'phrase_prefix',
                  query : parameters.query,
                  fields: fields
                }
              }
            ]
          }
        }// lastUpdate:[2016-09-14T14:00:00 TO 2016-09-14T15:05:00] AND stationID=7062
      }
    })
      .then(response => {
        res.ok(response.hits.hits);
      })
      .catch(error => {
        sails.log.error(error);
        res.serverError(500, error);
      });
  },

  differentTowns: function (req, res) {
    const elasticSearch = ElasticSearchService.instance;

    elasticSearch.search({
      index: 'lyon',
      type : velovStation.type,
      size : 0,
      body : {
        aggregations: {
          differentTowns: {
            terms: {
              field: 'town.untouched',
              size : 50
            }
          }
        }
      }
    })
      .then(response => {
        res.ok(response.aggregations.differentTowns.buckets);
      })
      .catch(error => {
        res.serverError(500, error);
      });
  },

  stat: function (req, res) {

    const parametersBlueprint = [
      {
        param   : 'query',
        required: true
      }
    ];

    let parameters = requestHelpers.secureParameters(parametersBlueprint, req);

    if (!parameters.isValid()) {
      return res.badRequest('No valid parameters.')
    }

    parameters = parameters.asObject();

    const towns = parameters.query.split(',');

    if (!Array.isArray(towns)) {
      return res.badRequest('No valid parameters.')

    }

    const elasticSearch = ElasticSearchService.instance;

    const aggregations = {};

    towns.forEach(town => {
      const usableTownName         = removeAccents(town).replace(/ /g, '').toLowerCase();
      aggregations[usableTownName] = {
        match_phrase: {
          'town.folded': town
        },
        aggregations: {
          sum: {
            sum: {
              field: 'stands'
            }
          }
        }
      }
    });

    elasticSearch.search({
      index: 'lyon',
      type : velovStation.type,
      size : 0,
      body : {
        aggregations: aggregations
      }
    })
      .then(response => {
        res.ok(response.aggregations);
      })
      .catch(error => {
        sails.log.error(error);
        res.serverError(500, error);
      })
  },

  import: function (req, res) {
    VelovStationService.doImport()
      .then(() => {
        res.ok();
      })
      .catch(error => {
        res.serverError(500, error);
      });
  }

};
