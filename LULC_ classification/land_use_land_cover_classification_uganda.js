
// Center the map on the mining sites
var geometry = karamoja.geometry();
Map.centerObject(geometry, 8);

// Add the Open Buildings layer
var fvLayer = ui.Map.FeatureViewLayer('GOOGLE/Research/open-buildings/v3/polygons_FeatureView');
var buildings = ee.FeatureCollection('GOOGLE/Research/open-buildings/v3/polygons').filterBounds(geometry);

// Filter buildings by confidence intervals
var buildings_065_070 = buildings.filter(ee.Filter.and(
  ee.Filter.gte('confidence', 0.65),
  ee.Filter.lt('confidence', 0.70)
));
var buildings_070_075 = buildings.filter(ee.Filter.and(
  ee.Filter.gte('confidence', 0.70),
  ee.Filter.lt('confidence', 0.75)
));
var buildings_gte_075 = buildings.filter(ee.Filter.gte('confidence', 0.75));

// Add building layers to the map
Map.addLayer(buildings_065_070, {color: 'FF0000'}, 'Buildings confidence [0.65; 0.7)', false);
Map.addLayer(buildings_070_075, {color: 'FFFF00'}, 'Buildings confidence [0.7; 0.75)', false);
Map.addLayer(buildings_gte_075, {color: '00FF00'}, 'Buildings confidence >= 0.75', false);

// Define the years to process
var years = ee.List([2019, 2020, 2021, 2022, 2023]);

// Function to add remote sensing indices
var addIndices = function(image) {
  var ndvi = image.normalizedDifference(['B8', 'B4']).rename(['ndvi']);
  var ndbi = image.normalizedDifference(['B11', 'B8']).rename(['ndbi']);
  var mndwi = image.normalizedDifference(['B3', 'B11']).rename(['mndwi']);
  var nbr = image.normalizedDifference(['B5', 'B7']).rename('nbr');
  var ndmi = image.normalizedDifference(['B5', 'B6']).rename('ndmi');
  var savi = image.expression(
    '((nir - red) / (nir + red + 0.5)) * (1 + 0.5)',
    {
      nir: image.select('B5'),
      red: image.select('B4')
    }
  ).rename('savi');
  var bsi = image.expression(
    '(( X + Y ) - (A + B)) /(( X + Y ) + (A + B)) ', {
      'X': image.select('B11'),
      'Y': image.select('B4'),
      'A': image.select('B8'),
      'B': image.select('B2')
  }).rename('bsi');
  var ui = image.expression(
    '((swir2 - nir) / (swir2 + nir )) +1',
    {
      nir: image.select('B5'),
      swir2: image.select('B7')
    }
  ).rename('ui');
  return image.addBands(ndvi).addBands(ndbi).addBands(mndwi).addBands(nbr).addBands(ndmi).addBands(savi).addBands(bsi).addBands(ui);
};

// Prepare training dataset
var buildings23 = buildings_065_070.merge(buildings_070_075).merge(buildings_gte_075);
var builds = buildings_gte_075.randomColumn().filter('random <= 0.01');
var buildings_23 = builds.map(function(feature) {
  return feature.set('land_cover', 2);
});

var rds = mining_sites_roads.randomColumn().filter('random <= 0.01');
var roads = rds.map(function(feature) {
  return feature.set('land_cover', 1);
});

var bares23 = bare_2023.merge(roads);
Map.addLayer(buildings_23, {color: 'FF0000'}, 'Built-Up Areas', false);

// Merge collected data for all classes
var collectedData_23 = vegetation_2023.merge(bares23).merge(buildings_23).merge(mining_2023).merge(water_2023);
var collectedData_21 = vegetation_2021.merge(bare_2021).merge(buildings_2021).merge(mining_2021).merge(water_2021);
var collectedData_19 = vegetation_2019.merge(bare_2019).merge(buildings_2019).merge(mining_2019).merge(water_2019);
var collectedData_17 = vegetation_2017.merge(bare_2017).merge(buildings_2017).merge(mining_2017).merge(water_2017);

// Define collected data for each year
var collectedDataSets = {
  2023: collectedData_23,
  2022: collectedData_21,
  2021: collectedData_21,
  2020: collectedData_19,
  2019: collectedData_19
};

// Create training, validation, and testing sets
var trainingSets = {};
var validationSets = {};
var testingSets = {};
var seed = 42;

Object.keys(collectedDataSets).forEach(function(year) {
  var collectedData = collectedDataSets[year];
  var withRndcol = collectedData.randomColumn('random', seed);
  trainingSets[year] = withRndcol.filter(ee.Filter.lt('random', 0.7));
  validationSets[year] = withRndcol.filter(ee.Filter.gte('random', 0.7)).filter(ee.Filter.lt('random', 0.85));
  testingSets[year] = withRndcol.filter(ee.Filter.gte('random', 0.85));
});

// Define band combinations for each year
var classificationBandsGroups = {
  "2019": ["B2", "B3", "B4", "B5", "B6", "B7", "B8", "B8A", "B9", "B11", "B12", "ndvi", "ui", "ndmi"],
  "2020": ["B2", "B3", "B4", "B5", "B6", "B7", "B8", "B8A", "B9", "B11", "B12", "ndvi", "ui", "ndmi"],
  "2021": ["ndvi", "ui", "ndmi", "B1", "B2", "B3", "B4", "B5", "B6", "B7", "B8", "B8A", "B9", "B11", "B12"],
  "2022": ["ndvi", "ui", "ndmi", "B1", "B2", "B3", "B4", "B5", "B6", "B7", "B8", "B8A", "B9", "B11", "B12"],
  "2023": ["ndvi", "ui", "ndmi", "B1", "B2", "B3", "B4", "B5", "B6", "B7", "B8", "B8A", "B9", "B11", "B12"]
};

// Define images for each year and season
var yearImages = {
  "2019": {
    "dry": ee.Image('users/janetmutuku/karamoja_s2_harmonized/Normalized_Dry_Season_2019-10-01_2020-03-31'),
    "rainy": ee.Image('users/janetmutuku/karamoja_s2_harmonized/Normalized_Rainy_Season_2019-04-01_2019-09-30'),
    "year": ee.Image('users/janetmutuku/karamoja_s2_harmonized/Normalized_Whole_Year_Composite_2019')
  },
  "2020": {
    "dry": ee.Image('users/janetmutuku/karamoja_s2_harmonized/Normalized_Dry_Season_2020-10-01_2021-03-31'),
    "rainy": ee.Image('users/janetmutuku/karamoja_s2_harmonized/Normalized_Rainy_Season_2020-04-01_2020-09-30'),
    "year": ee.Image('users/janetmutuku/karamoja_s2_harmonized/Normalized_Whole_Year_Composite_2020')
  },
  "2021": {
    "dry": ee.Image('users/janetmutuku/karamoja_s2_harmonized/Normalized_Dry_Season_2021-10-01_2022-03-31'),
    "rainy": ee.Image('users/janetmutuku/karamoja_s2_harmonized/Normalized_Rainy_Season_2021-04-01_2021-09-30'),
    "year": ee.Image('users/janetmutuku/karamoja_s2_harmonized/Normalized_Whole_Year_Composite_2021')
  },
  "2022": {
    "dry": ee.Image('users/janetmutuku/karamoja_s2_harmonized/Normalized_Dry_Season_2022-10-01_2023-03-31'),
    "rainy": ee.Image('users/janetmutuku/karamoja_s2_harmonized/Normalized_Rainy_Season_2022-04-01_2022-09-30'),
    "year": ee.Image('users/janetmutuku/karamoja_s2_harmonized/Normalized_Whole_Year_Composite_2022')
  },
  "2023": {
    "dry": ee.Image('users/janetmutuku/karamoja_s2_harmonized/Normalized_Dry_Season_2023-10-01_2024-03-31'),
    "rainy": ee.Image('users/janetmutuku/karamoja_s2_harmonized/Normalized_Rainy_Season_2023-04-01_2023-09-30'),
    "year": ee.Image('users/janetmutuku/karamoja_s2_harmonized/Normalized_Whole_Year_Composite_2023')
  }
};

// Function to calculate area per class and print results with charts
//function calculateAndPrintArea(classifiedImage, geometry, year, season) {
var classNames = ['bare land', 'builr-up areas', 'mining', 'water bodies', 'vegetation'];
var create_chart = function(classifiedImage, classNames){ // for classNames, create a list of your classes as strings
var options = {
  hAxis: {title: 'Land Cover Class'},
  vAxis: {title: 'Area in hectares'},
  title: 'Area in HA by Land Cover Class',
  series: { // set color for each class
    0:{color:'yellow'},// bare
    1: {color: 'brown'}, // built-up areas 
    2: {color: 'orange'}, //mining
    3: {color: 'blue'}, // water
    4: {color: 'green'}},//// vegetation
};
  var areaChart = ui.Chart.image.byClass({
    image: ee.Image.pixelArea().divide(10000).addBands(classifiedImage),
    classBand: 'classification', 
    scale: 10,
    region: geometry,
    reducer: ee.Reducer.sum()

  }).setSeriesNames(classNames)
  .setOptions(options) ;
  print(areaChart);
};

 // }


// Main processing loop
years.evaluate(function(yearsList) {
  yearsList.forEach(function(year) {
    var yearStr = year.toString();
    ["dry", "rainy", "year"].forEach(function(season) {
      var composite = yearImages[yearStr][season];
      var withIndices = addIndices(composite);
      var selectedBands = classificationBandsGroups[yearStr];
      var withSelectedBands = withIndices.select(selectedBands);
      
      // Sample the training, validation, and testing sets
      var training = withSelectedBands.sampleRegions({
        collection: trainingSets[year],
        properties: ["land_cover"],
        scale: 10
      });
      var validation = withSelectedBands.sampleRegions({
        collection: validationSets[year],
        properties: ["land_cover"],
        scale: 10
      });
      var testing = withSelectedBands.sampleRegions({
        collection: testingSets[year],
        properties: ["land_cover"],
        scale: 10
      });

      // Train a random forest classifier
      var classifier = ee.Classifier.smileRandomForest(30).train({
        features: training,
        classProperty: 'land_cover',
        inputProperties: withSelectedBands.bandNames()
      });

      // Classify and compute accuracies
      var validationClassified = validation.classify(classifier);
      var validationErrorMatrix = validationClassified.errorMatrix('land_cover', 'classification');
      var validationAccuracy = validationErrorMatrix.accuracy();
      print('Validation Accuracy for year ' + year + ' ' + season + ':', validationAccuracy);
      print('Validation Confusion Matrix for year ' + year + ' ' + season + ':', validationErrorMatrix);

      var testingClassified = testing.classify(classifier);
      var testingErrorMatrix = testingClassified.errorMatrix('land_cover', 'classification');
      var testingAccuracy = testingErrorMatrix.accuracy();
      print('Testing Accuracy for year ' + year + ' ' + season + ':', testingAccuracy);
      print('Testing Confusion Matrix for year ' + year + ' ' + season + ':', testingErrorMatrix);

      // Classify the entire image
      var imgClassified = withSelectedBands.classify(classifier);
      
      // Export classified image
      Export.image.toDrive({
        image: imgClassified,
        description: 'Classified_' + year + '_' + season,
        folder: 'earthengine',
        fileNamePrefix: 'Classified_' + year + '_' + season,
        region: geometry,
        crs: 'EPSG:4326',
        scale: 10,
        maxPixels: 1e13,
        formatOptions: {
          noData: 0,
        }
      });

      // Export RGB image
      Export.image.toDrive({
        image: withSelectedBands.select(['B4', 'B3', 'B2']),
        description: 'RGB_' + year + '_' + season,
        folder: 'earthengine',
        fileNamePrefix: 'RGB_' + year + '_' + season,
        crs: 'EPSG:4326',
        region: geometry,
        scale: 10,
        maxPixels: 1e13
      });

      // Add layers to map
      var classVis = {
        min: 1,
        max: 5,
        palette: ['grey', 'red', 'orange', 'blue', 'limegreen']
      };
      Map.addLayer(withSelectedBands, {bands: ['B4', 'B3', 'B2'], min: 0, max: 0.3}, 's2_img_' + year + '_' + season, false);
      Map.addLayer(imgClassified, classVis, 'Classified_' + year + '_' + season, false);
      // Inside your main processing loop
      
      //create_chart(imgClassified, classNames);
    });
  });
});

//))))))))))))))))))))))))))))))))))))))))))00000000))))))))))))))))))))))000000000

// var geometry = mining_sites.geometry();
// Map.centerObject(geometry, 8);


// var fvLayer = ui.Map.FeatureViewLayer(
//   'GOOGLE/Research/open-buildings/v3/polygons_FeatureView');
// // Define the feature collection with a bound filter to the specific geometry
// var buildings = ee.FeatureCollection('GOOGLE/Research/open-buildings/v3/polygons').filterBounds(geometry);

// // Filter buildings by confidence intervals
// var buildings_065_070 = buildings.filter(ee.Filter.and(
//   ee.Filter.gte('confidence', 0.65),
//   ee.Filter.lt('confidence', 0.70)
// ));
// var buildings_070_075 = buildings.filter(ee.Filter.and(
//   ee.Filter.gte('confidence', 0.70),
//   ee.Filter.lt('confidence', 0.75)
// ));
// var buildings_gte_075 = buildings.filter(ee.Filter.gte('confidence', 0.75));

// Map.addLayer(buildings_065_070, {color: 'FF0000'}, 'Buildings confidence [0.65; 0.7)',false);
// Map.addLayer(buildings_070_075, {color: 'FFFF00'}, 'Buildings confidence [0.7; 0.75)',false);
// Map.addLayer(buildings_gte_075, {color: '00FF00'}, 'Buildings confidence >= 0.75',false);


// // Define the years you want to process
// var years = ee.List([2019,2020 ,2021, 2022, 2023]);

// // Remote sensing indices
// var addIndices = function(image) {
//   var ndvi = image.normalizedDifference(['B8', 'B4']).rename(['ndvi']);
//   var ndbi = image.normalizedDifference(['B11', 'B8']).rename(['ndbi']);
//   var mndwi = image.normalizedDifference(['B3', 'B11']).rename(['mndwi']);
//   var nbr = image.normalizedDifference(['B5', 'B7']).rename('nbr');
//   var ndmi = image.normalizedDifference(['B5', 'B6']).rename('ndmi');
//   var savi = image.expression(
//     '((nir - red) / (nir + red + 0.5)) * (1 + 0.5)',
//     {
//       nir: image.select('B5'),
//       red: image.select('B4')
//     }
//   ).rename('savi');
//   var bsi = image.expression(
//     '(( X + Y ) - (A + B)) /(( X + Y ) + (A + B)) ', {
//       'X': image.select('B11'),
//       'Y': image.select('B4'),
//       'A': image.select('B8'),
//       'B': image.select('B2')
//   }).rename('bsi');
//   var ui = image.expression(
//     '((swir2 - nir) / (swir2 + nir )) +1',
//     {
//       nir: image.select('B5'),
//       swir2: image.select('B7')
//     }
//   ).rename('ui');
//   return image.addBands(ndvi).addBands(ndbi).addBands(mndwi).addBands(nbr).addBands(ndmi).addBands(savi).addBands(bsi).addBands(ui);
// };

// // ______________________ Collection of the training dataset_______________________


// var buildings23 = buildings_065_070.merge(buildings_070_075).merge(buildings_gte_075);
// var builds = buildings_gte_075.randomColumn().filter('random <= 0.01');
// print('buildings23',builds);
// var buildings_23 = builds.map(function(feature) {
//   return feature.set('land_cover', 2); // Assign a unique class, e.g., 7 for roads
// });

// //roads
// var rds = mining_sites_roads.randomColumn().filter('random <= 0.01');
// var roads = rds.map(function(feature) {
//   return feature.set('land_cover', 1); // Assign a unique class, e.g., 7 for roads
// });

// var bares23 = bare_2023.merge(roads);
// // Add the built-up areas layer to the map with a unified color
// Map.addLayer(buildings_23, {color: 'FF0000'}, 'Built-Up Areas',false);
// // Merge collected data for year for all classes
// var collectedData_23 = vegetation_2023.merge(bares23).merge(buildings_23).merge(mining_2023).merge(water_2023);
// var collectedData_21 = vegetation_2021.merge(bare_2021).merge(buildings_2021).merge(mining_2021).merge(water_2021);
// var collectedData_19 = vegetation_2019.merge(bare_2019).merge(buildings_2019).merge(mining_2019).merge(water_2019);
// var collectedData_17 = vegetation_2017.merge(bare_2017).merge(buildings_2017).merge(mining_2017).merge(water_2017);

// // Define the collected data for each year
// var collectedDataSets = {
//   2023: collectedData_23,
//   2022: collectedData_21,
//   2021: collectedData_21,
//   2020: collectedData_19,
//   2019: collectedData_19
// };

// // Define containers for training, validation, and testing sets
// var trainingSets = {};
// var validationSets = {};
// var testingSets = {};
// var seed = 42;

// // Loop through each year and create training, validation, and testing sets
// Object.keys(collectedDataSets).forEach(function(year) {
//   var collectedData = collectedDataSets[year];

//   var withRndcol = collectedData.randomColumn('random', seed);
//   trainingSets[year] = withRndcol.filter(ee.Filter.lt('random', 0.7));
//   validationSets[year] = withRndcol.filter(ee.Filter.gte('random', 0.7)).filter(ee.Filter.lt('random', 0.85));
//   testingSets[year] = withRndcol.filter(ee.Filter.gte('random', 0.85));
// });

// // Print the trainingSets, validationSets, and testingSets
// Object.keys(trainingSets).forEach(function(year) {
//   print('Training set for ' + year + ':', trainingSets[year]);
//   print('Validation set for ' + year + ':', validationSets[year]);
//   print('Testing set for ' + year + ':', testingSets[year]);
// });

// // Proposed different band combinations for each year
// var classificationBandsGroups = {
//   "2019": ["B2", "B3", "B4", "B5", "B6", "B7", "B8", "B8A", "B9", "B11", "B12", "ndvi", "ui", "ndmi"],
//   "2020": ["B2", "B3", "B4", "B5", "B6", "B7", "B8", "B8A", "B9", "B11", "B12", "ndvi", "ui", "ndmi"],
//   "2021": ["ndvi", "ui", "ndmi", "B1", "B2", "B3", "B4", "B5", "B6", "B7", "B8", "B8A", "B9", "B11", "B12"],
//   "2022": ["ndvi", "ui", "ndmi", "B1", "B2", "B3", "B4", "B5", "B6", "B7", "B8", "B8A", "B9", "B11", "B12"],
//   "2023": ["ndvi", "ui", "ndmi", "B1", "B2", "B3", "B4", "B5", "B6", "B7", "B8", "B8A", "B9", "B11", "B12"]
// };

// // Map of year to images
// var yearImages = {
//   "2019": {
//     "dry": ee.Image('users/janetmutuku/karamoja_s2_harmonized/Normalized_Dry_Season_2019-10-01_2020-03-31'),
//     "rainy": ee.Image('users/janetmutuku/karamoja_s2_harmonized/Normalized_Rainy_Season_2019-04-01_2019-09-30'),
//     "year": ee.Image('users/janetmutuku/karamoja_s2_harmonized/Normalized_Whole_Year_Composite_2019')
//   },
//     "2020": {
//     "dry": ee.Image('users/janetmutuku/karamoja_s2_harmonized/Normalized_Dry_Season_2020-10-01_2021-03-31'),
//     "rainy": ee.Image('users/janetmutuku/karamoja_s2_harmonized/Normalized_Rainy_Season_2020-04-01_2020-09-30'),
//     "year": ee.Image('users/janetmutuku/karamoja_s2_harmonized/Normalized_Whole_Year_Composite_2020')
//     },
//   "2021": {
//     "dry": ee.Image('users/janetmutuku/karamoja_s2_harmonized/Normalized_Dry_Season_2021-10-01_2022-03-31'),
//     "rainy": ee.Image('users/janetmutuku/karamoja_s2_harmonized/Normalized_Rainy_Season_2021-04-01_2021-09-30'),
//     "year": ee.Image('users/janetmutuku/karamoja_s2_harmonized/Normalized_Whole_Year_Composite_2021')
//   },
//   "2022": {
//     "dry": ee.Image('users/janetmutuku/karamoja_s2_harmonized/Normalized_Dry_Season_2022-10-01_2023-03-31'),
//     "rainy": ee.Image('users/janetmutuku/karamoja_s2_harmonized/Normalized_Rainy_Season_2022-04-01_2022-09-30'),
//     "year": ee.Image('users/janetmutuku/karamoja_s2_harmonized/Normalized_Whole_Year_Composite_2022')
//   },
//   "2023": {
//     "dry": ee.Image('users/janetmutuku/karamoja_s2_harmonized/Normalized_Dry_Season_2023-10-01_2024-03-31'),
//     "rainy": ee.Image('users/janetmutuku/karamoja_s2_harmonized/Normalized_Rainy_Season_2023-04-01_2023-09-30'),
//     "year": ee.Image('users/janetmutuku/karamoja_s2_harmonized/Normalized_Whole_Year_Composite_2023')
//   }
// };

// // Loop through each year
// years.evaluate(function(years) {
//   years.forEach(function(year) {
//     // Get the images for the year
//     var images = yearImages[year.toString()];

//     ["dry", "rainy", "year"].forEach(function(season) {
//       var composite = images[season];
//       var withIndices = addIndices(composite);
//       var selectedBands = classificationBandsGroups[year.toString()];
//       var withSelectedBands = withIndices.select(selectedBands);
      
//       // Sample the training set
//       var training = withSelectedBands.sampleRegions({
//         collection: trainingSets[year], // Use the specific training set for the year
//         properties: ["land_cover"],
//         scale: 10
//       });

//       // Sample the validation set
//       var validation = withSelectedBands.sampleRegions({
//         collection: validationSets[year], // Use the specific validation set for the year
//         properties: ["land_cover"],
//         scale: 10
//       });

//       // Sample the testing set
//       var testing = withSelectedBands.sampleRegions({
//         collection: testingSets[year], // Use the specific testing set for the year
//         properties: ["land_cover"],
//         scale: 10
//       });

//       // Train a random forest classifier
//       var classifier = ee.Classifier.smileRandomForest(30).train({
//         features: training,
//         classProperty: 'land_cover',
//         inputProperties: withSelectedBands.bandNames()
//       });

//       // Classify the validation set and compute accuracy
//       var validationClassified = validation.classify(classifier);
//       var validationErrorMatrix = validationClassified.errorMatrix('land_cover', 'classification');
//       var validationAccuracy = validationErrorMatrix.accuracy();
//       print('Validation Accuracy for year ' + year + ' ' + season + ':', validationAccuracy);
//       print('Validation Confusion Matrix for year ' + year + ' ' + season + ':', validationErrorMatrix);

//       // Classify the testing set and compute accuracy
//       var testingClassified = testing.classify(classifier);
//       var testingErrorMatrix = testingClassified.errorMatrix('land_cover', 'classification');
//       var testingAccuracy = testingErrorMatrix.accuracy();
//       print('Testing Accuracy for year ' + year + ' ' + season + ':', testingAccuracy);
//       print('Testing Confusion Matrix for year ' + year + ' ' + season + ':', testingErrorMatrix);

//       // Classify the entire image
//       var imgClassified = withSelectedBands.classify(classifier);
      
//       var noDataVal = 0;
//       // Export the classified image as GeoTIFF
//       Export.image.toDrive({
//         image: imgClassified,
//         description: 'Classified_' + year + '_' + season,
//         folder: 'earthengine',
//         fileNamePrefix: 'Classified_' + year + '_' + season,
//         region: geometry,
//         crs: 'EPSG:4326',
//         scale: 10,
//         maxPixels: 1e13,
//         formatOptions: {
//             noData: noDataVal,
//         }
//       });

//       // Export the RGB image as GeoTIFF
//       Export.image.toDrive({
//         image: withSelectedBands.select(['B4', 'B3', 'B2']),
//         description: 'RGB_' + year + '_' + season,
//         folder: 'earthengine',
//         fileNamePrefix: 'RGB_' + year + '_' + season,
//         crs: 'EPSG:4326',
//         region: geometry,
//         scale: 10,
//         maxPixels: 1e13
//       });

//       var classVis = {
//         min: 1,
//         max: 5,
//         palette: ['grey', 'red', 'orange', 'blue', 'limegreen']
//       };

//       Map.addLayer(withSelectedBands, {bands: ['B4', 'B3', 'B2'], min: 0, max: 0.3}, 's2_img_' + year + '_' + season, false);
//       Map.addLayer(imgClassified, classVis, 'Classified_' + year + '_' + season, false);
//     });
//   });
// });




// ______________________ Export the training data as KMl in drive and asset in GEE ______________________

// Define the file formats and other settings
// var fileFormat = 'KML'; // You can also use 'GeoJSON' or 'CSV' if preferred
// var userAssetFolder = 'users/janetmutuku/uganda/';

// // Loop through each year and export the data
// Object.keys(collectedDataSets).forEach(function(year) {
//   var collectedData = collectedDataSets[year];

//   // Export to Google Drive
//   Export.table.toDrive({
//     collection: collectedData,
//     description: 'CollectedDataExport_' + year,
//     fileFormat: fileFormat
//   });

//   // Export as an asset
//   Export.table.toAsset({
//     collection: collectedData,
//     description: 'CollectedDataAsset_' + year,
//     assetId: userAssetFolder + 'training_labels_' + year
//   });
// });

// ________________ Area Estimation___________________________________
// Preparing the reference sample data === Will soon add reference data collected using Collect Earth online 
//for better area estimation

// // Function to calculate area per class and print results
// function calculateAndPrintArea(imgClassified, geometry, year, season) {
//   var pixelArea = ee.Image.pixelArea(); // Area per pixel in square meters
//   var areaImage = imgClassified.multiply(pixelArea).divide(10000); // Convert to hectares

//   var areas = areaImage.reduceRegion({
//     reducer: ee.Reducer.sum().group({
//       groupField: 0, // Assuming class values are in the first band
//       groupName: 'classification'
//     }),
//     geometry: geometry,
//     scale: 10, // Match your image resolution
//     maxPixels: 1e9
//   });

//   // Use evaluate to handle asynchronous operation
//   areas.evaluate(function(result) {
//     console.log('Year:', year, 'Season:', season, 'Areas:', result);
//   });
// }

// // Assuming 'years' is an ee.List of years
// years.evaluate(function(yearList) {
//   yearList.forEach(function(year) {
//     ['dry', 'rainy', 'year'].forEach(function(season) {
//       var imgClassified = yearImages[year][season]; // Ensure this points to your classified image
//       calculateAndPrintArea(imgClassified, geometry, year, season);
//     });
//   });
// });







































// var geometry = mining_sites.geometry();
// Map.centerObject(geometry, 8);
 
// // Define the years you want to process
// var years = ee.List([2017,2018,2019, 2021,2022,2023]);//2017, 2018, 2019, 2020, 2022,

// // Remote sensing indices
// var addIndices = function(image) {
//   var ndvi = image.normalizedDifference(['B8', 'B4']).rename(['ndvi']);
//   var ndbi = image.normalizedDifference(['B11', 'B8']).rename(['ndbi']);
//   var mndwi = image.normalizedDifference(['B3', 'B11']).rename(['mndwi']);
//   var nbr = image.normalizedDifference(['B5', 'B7']).rename('nbr');
//   var ndmi = image.normalizedDifference(['B5', 'B6']).rename('ndmi');
//   var savi = image.expression(
//     '((nir - red) / (nir + red + 0.5)) * (1 + 0.5)',
//     {
//       nir: image.select('B5'),
//       red: image.select('B4')
//     }
//   ).rename('savi');
//   var bsi = image.expression(
//     '(( X + Y ) - (A + B)) /(( X + Y ) + (A + B)) ', {
//       'X': image.select('B11'),
//       'Y': image.select('B4'),
//       'A': image.select('B8'),
//       'B': image.select('B2')
//   }).rename('bsi');
//   var ui = image.expression(
//     '((swir2 - nir) / (swir2 + nir )) +1',
//     {
//       nir: image.select('B5'),
//       swir2: image.select('B7')
//     }
//   ).rename('ui');
//   return image.addBands(ndvi).addBands(ndbi).addBands(mndwi).addBands(nbr).addBands(ndmi).addBands(savi).addBands(bsi).addBands(ui);
// };

// // Function to Normalize Image
// function normalize(image) {
//   var bandNames = image.bandNames();
//   var minDict = image.reduceRegion({
//     reducer: ee.Reducer.min(),
//     geometry: geometry,
//     scale: 10,
//     maxPixels: 1e9,
//     bestEffort: true,
//     tileScale: 16
//   });
//   var maxDict = image.reduceRegion({
//     reducer: ee.Reducer.max(),
//     geometry: geometry,
//     scale: 10,
//     maxPixels: 1e9,
//     bestEffort: true,
//     tileScale: 16
//   });
//   var mins = ee.Image.constant(minDict.values(bandNames));
//   var maxs = ee.Image.constant(maxDict.values(bandNames));
//   var normalized = image.subtract(mins).divide(maxs.subtract(mins));
//   return normalized;
// }

// // ______________________ Collection of the training dataset_______________________

// //Merge collected data for year for all classes
// var collectedData_23= vegetation_2023.merge(bare_2023).merge(buildings_2023).merge(mining_2023).merge(water_2023);
// var collectedData_21= vegetation_2021.merge(bare_2021).merge(buildings_2021).merge(mining_2021).merge(water_2021);
// var collectedData_19= vegetation_2019.merge(bare_2019).merge(buildings_2019).merge(mining_2019).merge(water_2019);
// var collectedData_17= vegetation_2017.merge(bare_2017).merge(buildings_2017).merge(mining_2017).merge(water_2017);

// // Define the collected data for each year
// var collectedDataSets = {
//   2023: collectedData_23,
//   2021: collectedData_21,
//   2019: collectedData_19,
//   2017: collectedData_17
// };

// // Define containers for training, validation, and testing sets
// var trainingSets = {};
// var validationSets = {};
// var testingSets = {};
// var seed = 42;

// // Loop through each year and create training, validation, and testing sets
// Object.keys(collectedDataSets).forEach(function(year) {
//   var collectedData = collectedDataSets[year];

//   var withRndcol = collectedData.randomColumn('random', seed);
//   trainingSets[year] = withRndcol.filter(ee.Filter.lt('random', 0.6));
//   validationSets[year] = withRndcol.filter(ee.Filter.gte('random', 0.6)).filter(ee.Filter.lt('random', 0.8));
//   testingSets[year] = withRndcol.filter(ee.Filter.gte('random', 0.8));
// });

// //  Print the trainingSets, validationSets, and testingSets
// Object.keys(trainingSets).forEach(function(year) {
//   print('Training set for ' + year + ':', trainingSets[year]);
//   print('Validation set for ' + year + ':', validationSets[year]);
//   print('Testing set for ' + year + ':', testingSets[year]);
// });


// // Define the collected data for each year
// var collectedDataSets = {
//   2023: collectedData_23,
//   2021: collectedData_21,
//   2019: collectedData_19,
//   2017: collectedData_17
// };

// // Define containers for training, validation, and testing sets
// var trainingSets = {};
// var validationSets = {};
// var testingSets = {};

// // Loop through each year and create training, validation, and testing sets
// Object.keys(collectedDataSets).forEach(function(year) {
//   var collectedData = collectedDataSets[year];

//   var withRndcol = collectedData.randomColumn('random', seed);
//   trainingSets[year] = withRndcol.filter(ee.Filter.lt('random', 0.6));
//   validationSets[year] = withRndcol.filter(ee.Filter.gte('random', 0.6)).filter(ee.Filter.lt('random', 0.8));
//   testingSets[year] = withRndcol.filter(ee.Filter.gte('random', 0.8));
// });

// // _____________________________Classification using RandomForest_______________________


// // Proposed different band combinations for each year 
// var classificationBandsGroups = {
//   "2017": ["ndvi", "B2", "B3", "B4", "B5", "B6", "B7", "B8", "B8A", "B9", "B11", "B12"],
//   "2019": ["B2", "B3", "B4", "B5", "B6", "B7", "B8", "B8A", "B9", "B11", "B12", "ndvi", "ui", "ndmi", 'B2_1', 'B3_1', 'B4_1', 'B5_1', 'B6_1', 'B7_1', 'B8_1', 'B8A_1', 'B9_1'],
//   "2021": ["ndvi", "ui", "ndmi", "B1", "B2", "B3", "B4", "B5", "B6", "B7", "B8", "B8A", "B9", "B11", "B12", 'B2_1', 'B3_1', 'B4_1', 'B5_1', 'B6_1', 'B7_1', 'B8_1', 'B8A_1', 'B9_1'],
//   "2023": ["ndvi", "ui", "ndmi", "B1", "B2", "B3", "B4", "B5", "B6", "B7", "B8", "B8A", "B9", "B11", "B12", 'B2_1', 'B3_1', 'B4_1', 'B5_1', 'B6_1', 'B7_1', 'B8_1', 'B8A_1', 'B9_1']
// };

// // Loop through each year
// years.evaluate(function(years) {
//   years.forEach(function(year) {
//     var composite = ee.Image('users/janetmutuku/uganda/karamoja_multitemporal_' + year);
//     var normalized = normalize(composite);
//     var withIndices = addIndices(normalized);
//     var selectedBands = classificationBandsGroups[year.toString()];
//     print(selectedBands);
//     var withSelectedBands = withIndices.select(selectedBands);

//     // Sample the training set
//     var training = withSelectedBands.sampleRegions({
//       collection: trainingSets[year], // Use the specific training set for the year
//       properties: ["land_cover"],
//       scale: 10
//     });

//     // Sample the validation set
//     var validation = withSelectedBands.sampleRegions({
//       collection: validationSets[year], // Use the specific validation set for the year
//       properties: ["land_cover"],
//       scale: 10
//     });

//     // Sample the testing set
//     var testing = withSelectedBands.sampleRegions({
//       collection: testingSets[year], // Use the specific testing set for the year
//       properties: ["land_cover"],
//       scale: 10
//     });

//     // Train a random forest classifier
//     var classifier = ee.Classifier.smileRandomForest(30).train({
//       features: training,
//       classProperty: 'land_cover',
//       inputProperties: withSelectedBands.bandNames()
//     });

//     // Classify the validation set and compute accuracy
//     var validationClassified = validation.classify(classifier);
//     var validationErrorMatrix = validationClassified.errorMatrix('land_cover', 'classification');
//     var validationAccuracy = validationErrorMatrix.accuracy();
//     print('Validation Accuracy for year ' + year + ':', validationAccuracy);
//     print('Validation Confusion Matrix for year ' + year + ':', validationErrorMatrix);

//     // Classify the testing set and compute accuracy
//     var testingClassified = testing.classify(classifier);
//     var testingErrorMatrix = testingClassified.errorMatrix('land_cover', 'classification');
//     var testingAccuracy = testingErrorMatrix.accuracy();
//     print('Testing Accuracy for year ' + year + ':', testingAccuracy);
//     print('Testing Confusion Matrix for year ' + year + ':', testingErrorMatrix);
    

//     // Classify the entire image
//     var imgClassified = withSelectedBands.classify(classifier);
    
//     var noDataVal = 0;
//     // Export the classified image as GeoTIFF
//     Export.image.toDrive({
//       image: imgClassified,
//       description: 'Classified_' + year,
//       folder: 'earthengine',
//       fileNamePrefix: 'Classified_' + year,
//       region: geometry,
//       crs: 'EPSG:4326',
//       scale: 10,
//       maxPixels: 1e13,
//       formatOptions: {
//           noData: noDataVal,
//     }
//     });
//     // Export the RGB image as GeoTIFF
//     Export.image.toDrive({
//       image: withSelectedBands.select(['B4', 'B3', 'B2']),
//       description: 'RGB_' + year,
//       folder: 'earthengine',
//       fileNamePrefix: 'RGB_' + year,
//       crs: 'EPSG:4326',
//       region: geometry,
//       scale: 10,
//       maxPixels: 1e13
//     });


//     var classVis = {
//       min: 1,
//       max: 5,
//       palette: [ 'grey', 'red', 'orange', 'blue','limegreen']
//     };

//     Map.addLayer(withSelectedBands, {bands: ['B4', 'B3', 'B2'], min: 0, max: 0.3}, 's2_img_' + year + '_normalized', false);
//     Map.addLayer(imgClassified, classVis, 'Classified_' + year, false);
//   });
// });



// // ______________________ Export the training data as KMl in drive and asset in GEE ______________________

// // Define the file formats and other settings
// var fileFormat = 'KML'; // You can also use 'GeoJSON' or 'CSV' if preferred
// var userAssetFolder = 'users/janetmutuku/uganda/';

// // Loop through each year and export the data
// Object.keys(collectedDataSets).forEach(function(year) {
//   var collectedData = collectedDataSets[year];

//   // Export to Google Drive
//   Export.table.toDrive({
//     collection: collectedData,
//     description: 'CollectedDataExport_' + year,
//     fileFormat: fileFormat
//   });

//   // Export as an asset
//   Export.table.toAsset({
//     collection: collectedData,
//     description: 'CollectedDataAsset_' + year,
//     assetId: userAssetFolder + 'training_labels_' + year
//   });
// });






// // ________________ Area Estimation___________________________________





// // / Preparing the reference sample data === Will soon add reference data colleted using Collect Earth online 
// //for better area estimation







































// var geometry = mining_sites.geometry();
// Map.centerObject(geometry, 8);
 
// // Define the years you want to process
// var years = ee.List([2017,2018,2019, 2021,2022,2023]);//2017, 2018, 2019, 2020, 2022,

// // Remote sensing indices
// var addIndices = function(image) {
//   var ndvi = image.normalizedDifference(['B8', 'B4']).rename(['ndvi']);
//   var ndbi = image.normalizedDifference(['B11', 'B8']).rename(['ndbi']);
//   var mndwi = image.normalizedDifference(['B3', 'B11']).rename(['mndwi']);
//   var nbr = image.normalizedDifference(['B5', 'B7']).rename('nbr');
//   var ndmi = image.normalizedDifference(['B5', 'B6']).rename('ndmi');
//   var savi = image.expression(
//     '((nir - red) / (nir + red + 0.5)) * (1 + 0.5)',
//     {
//       nir: image.select('B5'),
//       red: image.select('B4')
//     }
//   ).rename('savi');
//   var bsi = image.expression(
//     '(( X + Y ) - (A + B)) /(( X + Y ) + (A + B)) ', {
//       'X': image.select('B11'),
//       'Y': image.select('B4'),
//       'A': image.select('B8'),
//       'B': image.select('B2')
//   }).rename('bsi');
//   var ui = image.expression(
//     '((swir2 - nir) / (swir2 + nir )) +1',
//     {
//       nir: image.select('B5'),
//       swir2: image.select('B7')
//     }
//   ).rename('ui');
//   return image.addBands(ndvi).addBands(ndbi).addBands(mndwi).addBands(nbr).addBands(ndmi).addBands(savi).addBands(bsi).addBands(ui);
// };

// // Function to Normalize Image
// function normalize(image) {
//   var bandNames = image.bandNames();
//   var minDict = image.reduceRegion({
//     reducer: ee.Reducer.min(),
//     geometry: geometry,
//     scale: 10,
//     maxPixels: 1e9,
//     bestEffort: true,
//     tileScale: 16
//   });
//   var maxDict = image.reduceRegion({
//     reducer: ee.Reducer.max(),
//     geometry: geometry,
//     scale: 10,
//     maxPixels: 1e9,
//     bestEffort: true,
//     tileScale: 16
//   });
//   var mins = ee.Image.constant(minDict.values(bandNames));
//   var maxs = ee.Image.constant(maxDict.values(bandNames));
//   var normalized = image.subtract(mins).divide(maxs.subtract(mins));
//   return normalized;
// }

// // ______________________ Collection of the training dataset_______________________

// //Merge collected data for year for all classes
// var collectedData_23= vegetation_2023.merge(bare_2023).merge(buildings_2023).merge(mining_2023).merge(water_2023);
// var collectedData_21= vegetation_2021.merge(bare_2021).merge(buildings_2021).merge(mining_2021).merge(water_2021);
// var collectedData_19= vegetation_2019.merge(bare_2019).merge(buildings_2019).merge(mining_2019).merge(water_2019);
// var collectedData_17= vegetation_2017.merge(bare_2017).merge(buildings_2017).merge(mining_2017).merge(water_2017);

// // Define the collected data for each year
// var collectedDataSets = {
//   2023: collectedData_23,
//   2021: collectedData_21,
//   2019: collectedData_19,
//   2017: collectedData_17
// };

// // Define containers for training, validation, and testing sets
// var trainingSets = {};
// var validationSets = {};
// var testingSets = {};
// var seed = 42;

// // Loop through each year and create training, validation, and testing sets
// Object.keys(collectedDataSets).forEach(function(year) {
//   var collectedData = collectedDataSets[year];

//   var withRndcol = collectedData.randomColumn('random', seed);
//   trainingSets[year] = withRndcol.filter(ee.Filter.lt('random', 0.6));
//   validationSets[year] = withRndcol.filter(ee.Filter.gte('random', 0.6)).filter(ee.Filter.lt('random', 0.8));
//   testingSets[year] = withRndcol.filter(ee.Filter.gte('random', 0.8));
// });

// //  Print the trainingSets, validationSets, and testingSets
// Object.keys(trainingSets).forEach(function(year) {
//   print('Training set for ' + year + ':', trainingSets[year]);
//   print('Validation set for ' + year + ':', validationSets[year]);
//   print('Testing set for ' + year + ':', testingSets[year]);
// });


// // Define the collected data for each year
// var collectedDataSets = {
//   2023: collectedData_23,
//   2021: collectedData_21,
//   2019: collectedData_19,
//   2017: collectedData_17
// };

// // Define containers for training, validation, and testing sets
// var trainingSets = {};
// var validationSets = {};
// var testingSets = {};

// // Loop through each year and create training, validation, and testing sets
// Object.keys(collectedDataSets).forEach(function(year) {
//   var collectedData = collectedDataSets[year];

//   var withRndcol = collectedData.randomColumn('random', seed);
//   trainingSets[year] = withRndcol.filter(ee.Filter.lt('random', 0.6));
//   validationSets[year] = withRndcol.filter(ee.Filter.gte('random', 0.6)).filter(ee.Filter.lt('random', 0.8));
//   testingSets[year] = withRndcol.filter(ee.Filter.gte('random', 0.8));
// });

// // _____________________________Classification using RandomForest_______________________


// // Proposed different band combinations for each year 
// var classificationBandsGroups = {
//   "2017": ["ndvi", "B2", "B3", "B4", "B5", "B6", "B7", "B8", "B8A", "B9", "B11", "B12"],
//   "2019": ["B2", "B3", "B4", "B5", "B6", "B7", "B8", "B8A", "B9", "B11", "B12", "ndvi", "ui", "ndmi", 'B2_1', 'B3_1', 'B4_1', 'B5_1', 'B6_1', 'B7_1', 'B8_1', 'B8A_1', 'B9_1'],
//   "2021": ["ndvi", "ui", "ndmi", "B1", "B2", "B3", "B4", "B5", "B6", "B7", "B8", "B8A", "B9", "B11", "B12", 'B2_1', 'B3_1', 'B4_1', 'B5_1', 'B6_1', 'B7_1', 'B8_1', 'B8A_1', 'B9_1'],
//   "2023": ["ndvi", "ui", "ndmi", "B1", "B2", "B3", "B4", "B5", "B6", "B7", "B8", "B8A", "B9", "B11", "B12", 'B2_1', 'B3_1', 'B4_1', 'B5_1', 'B6_1', 'B7_1', 'B8_1', 'B8A_1', 'B9_1']
// };

// // Loop through each year
// years.evaluate(function(years) {
//   years.forEach(function(year) {
//     var composite = ee.Image('users/janetmutuku/uganda/karamoja_multitemporal_' + year);
//     var normalized = normalize(composite);
//     var withIndices = addIndices(normalized);
//     var selectedBands = classificationBandsGroups[year.toString()];
//     print(selectedBands);
//     var withSelectedBands = withIndices.select(selectedBands);

//     // Sample the training set
//     var training = withSelectedBands.sampleRegions({
//       collection: trainingSets[year], // Use the specific training set for the year
//       properties: ["land_cover"],
//       scale: 10
//     });

//     // Sample the validation set
//     var validation = withSelectedBands.sampleRegions({
//       collection: validationSets[year], // Use the specific validation set for the year
//       properties: ["land_cover"],
//       scale: 10
//     });

//     // Sample the testing set
//     var testing = withSelectedBands.sampleRegions({
//       collection: testingSets[year], // Use the specific testing set for the year
//       properties: ["land_cover"],
//       scale: 10
//     });

//     // Train a random forest classifier
//     var classifier = ee.Classifier.smileRandomForest(30).train({
//       features: training,
//       classProperty: 'land_cover',
//       inputProperties: withSelectedBands.bandNames()
//     });

//     // Classify the validation set and compute accuracy
//     var validationClassified = validation.classify(classifier);
//     var validationErrorMatrix = validationClassified.errorMatrix('land_cover', 'classification');
//     var validationAccuracy = validationErrorMatrix.accuracy();
//     print('Validation Accuracy for year ' + year + ':', validationAccuracy);
//     print('Validation Confusion Matrix for year ' + year + ':', validationErrorMatrix);

//     // Classify the testing set and compute accuracy
//     var testingClassified = testing.classify(classifier);
//     var testingErrorMatrix = testingClassified.errorMatrix('land_cover', 'classification');
//     var testingAccuracy = testingErrorMatrix.accuracy();
//     print('Testing Accuracy for year ' + year + ':', testingAccuracy);
//     print('Testing Confusion Matrix for year ' + year + ':', testingErrorMatrix);
    

//     // Classify the entire image
//     var imgClassified = withSelectedBands.classify(classifier);
    
//     var noDataVal = 0;
//     // Export the classified image as GeoTIFF
//     Export.image.toDrive({
//       image: imgClassified,
//       description: 'Classified_' + year,
//       folder: 'earthengine',
//       fileNamePrefix: 'Classified_' + year,
//       region: geometry,
//       crs: 'EPSG:4326',
//       scale: 10,
//       maxPixels: 1e13,
//       formatOptions: {
//           noData: noDataVal,
//     }
//     });
//     // Export the RGB image as GeoTIFF
//     Export.image.toDrive({
//       image: withSelectedBands.select(['B4', 'B3', 'B2']),
//       description: 'RGB_' + year,
//       folder: 'earthengine',
//       fileNamePrefix: 'RGB_' + year,
//       crs: 'EPSG:4326',
//       region: geometry,
//       scale: 10,
//       maxPixels: 1e13
//     });


//     var classVis = {
//       min: 1,
//       max: 5,
//       palette: [ 'grey', 'red', 'orange', 'blue','limegreen']
//     };

//     Map.addLayer(withSelectedBands, {bands: ['B4', 'B3', 'B2'], min: 0, max: 0.3}, 's2_img_' + year + '_normalized', false);
//     Map.addLayer(imgClassified, classVis, 'Classified_' + year, false);
//   });
// });



// // ______________________ Export the training data as KMl in drive and asset in GEE ______________________

// // Define the file formats and other settings
// var fileFormat = 'KML'; // You can also use 'GeoJSON' or 'CSV' if preferred
// var userAssetFolder = 'users/janetmutuku/uganda/';

// // Loop through each year and export the data
// Object.keys(collectedDataSets).forEach(function(year) {
//   var collectedData = collectedDataSets[year];

//   // Export to Google Drive
//   Export.table.toDrive({
//     collection: collectedData,
//     description: 'CollectedDataExport_' + year,
//     fileFormat: fileFormat
//   });

//   // Export as an asset
//   Export.table.toAsset({
//     collection: collectedData,
//     description: 'CollectedDataAsset_' + year,
//     assetId: userAssetFolder + 'training_labels_' + year
//   });
// });






// // ________________ Area Estimation___________________________________





// // / Preparing the reference sample data === Will soon add reference data colleted using Collect Earth online 
// //for better area estimation



















