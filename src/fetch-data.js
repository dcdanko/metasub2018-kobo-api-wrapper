require("dotenv").config();

const d3 = require("d3");
const superagent = require("superagent");
const _ = require("underscore");
const { readFile } = require("./util");

const { KOBO_USERNAME, KOBO_PASSWORD } = process.env;
const FIXED_KEYS = ["end", "_geolocation", "_attachments", "_id"];

let _metadata = undefined;
const getMetadata = async () => {
  if (_metadata === undefined) {
    _metadata = d3.csvParse(await readFile("./data/metadata.csv", "utf8"));
  }
  return _metadata;
};

let _rawCities = undefined;
const getRawCities = async () => {
  if (_rawCities === undefined) {
    _rawCities = d3.csvParse(await readFile("./data/cities.csv", "utf8"));
  }
  return _rawCities;
};

let _keys = undefined;
const getKeys = async () => {
  if (_keys === undefined) {
    const metadata = await getMetadata();
    _keys = _.uniq(metadata.map(md => md.category).concat(FIXED_KEYS));
  }
  return _keys;
};

const fetchCityFeatures = async cityId => {
  if (!cityId) return [];

  return superagent
    .get(`https://kc.kobotoolbox.org/api/v1/data/${cityId}?format=json`)
    .timeout(60 * 10 * 1000)
    .auth(KOBO_USERNAME, KOBO_PASSWORD)
    .then(res => res.body)
    .catch(err => {
      console.error(
        `Error fetching features from Kobo Toolbox for city ID ${cityId}: '${
          err.message
        }'`
      );
      return [];
    });
};

const doesFeatureMatchYear = year => feature => {
  const regEx = new RegExp(`^${year}`);
  return feature.end && feature.end.match(regEx);
};

const hydratedCity = city => {
  const newFields = {
    live: true,
    lat: parseFloat(city.lat),
    lon: parseFloat(city.lon),
    features: []
  };
  return Object.assign({}, city, newFields);
};

const cityWithFeatures = async (city, year) => {
  const keys = await getKeys();
  const features = await fetchCityFeatures(city.id)
    .then(features => {
      if (!year) return features;
      return features.filter(doesFeatureMatchYear(year));
    })
    .then(features => features.map(feature => _.pick(feature, keys)));
  return Object.assign({}, city, { features });
};

const getCitiesData = async year => {
  const cities = (await getRawCities()).map(hydratedCity);

  if (!(KOBO_USERNAME && KOBO_PASSWORD)) {
    console.error("Kobo username or password was not provided!");
    return cities;
  }

  return Promise.all(cities.map(city => cityWithFeatures(city, year)));
};

module.exports = {
  getMetadata,
  getCitiesData
};
