// Define the points and buffers
var point = ee.Geometry.Point([34.663752, 2.556330]);
var point2 = ee.Geometry.Point([34.845722, 2.405936]);
var bufferDistance = 1000;
// var pointBuffer = point.buffer(bufferDistance);
// var pointBuffer2 = point2.buffer(100);
var mining_buffer = karamoja;//pointBuffer.union(pointBuffer2);

// Cloud masking function
function maskS2clouds(image) {
  var qa = image.select('QA60');
  var cloudBitMask = 1 << 10;
  var cirrusBitMask = 1 << 11;
  var mask = qa.bitwiseAnd(cloudBitMask).eq(0)
            .and(qa.bitwiseAnd(cirrusBitMask).eq(0));
  return image.updateMask(mask).divide(10000);
}

// Create season composites
var cropCalendar = [[4, 9], [10, 3]];

function createSeasonComposites(months, year) {
  var startMonth = months[0];
  var endMonth = months[1];
  var startDate, endDate;

  if (startMonth > endMonth) {
    startDate = ee.Date.fromYMD(year, startMonth, 1);
    endDate = ee.Date.fromYMD(year + 1, endMonth, 31);
  } else {
    startDate = ee.Date.fromYMD(year, startMonth, 1);
    endDate = ee.Date.fromYMD(year, endMonth, 30);
  }

  print('Start Date:', startDate, 'End Date:', endDate);

  // Load Sentinel-2 data and apply cloud masking
  var im = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
                      .filterDate(startDate, endDate)
                      .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
                      .map(maskS2clouds);
  var composite = im.median().clip(mining_buffer).select('B.*|QA.*');
  return {composite: composite, startDate: startDate, endDate: endDate};
}

// Normalize image function
function normalize(image) {
  var bandNames = image.bandNames();
  var minDict = image.reduceRegion({
    reducer: ee.Reducer.min(),
    geometry: mining_buffer,
    scale: 10,
    maxPixels: 1e13,
    bestEffort: true,
    tileScale: 16
  });

  var maxDict = image.reduceRegion({
    reducer: ee.Reducer.max(),
    geometry: mining_buffer,
    scale: 10,
    maxPixels: 1e13,
    bestEffort: true,
    tileScale: 16
  });

  var mins = ee.Image.constant(bandNames.map(function(b) {
    var minValue = ee.Number(minDict.get(b));
    return ee.Number(ee.Algorithms.If(minValue, minValue, 0));
  }));

  var maxs = ee.Image.constant(bandNames.map(function(b) {
    var maxValue = ee.Number(maxDict.get(b));
    return ee.Number(ee.Algorithms.If(maxValue, maxValue, 1));
  }));

  var normalized = image.subtract(mins).divide(maxs.subtract(mins));
  
  // Convert all bands to Float32 to ensure consistency
  return normalized.toFloat();
}

// Define the range of years
var years = Array.from({length: 7}, function(_, i) { return 2017 + i; });

// Initialize an empty array to store composites
var composites = [];

// Loop through each year to create composites
years.forEach(function(year) {
  var compositeList = cropCalendar.map(function(months) {
    return createSeasonComposites(months, year);
  });

  compositeList.forEach(function(item, index) {
    var normalized = normalize(item.composite);
    var season = index === 0 ? 'Rainy' : 'Dry';
    
    composites.push({year: year, season: season, composite: normalized, startDate: item.startDate, endDate: item.endDate});
    
    // Export composite to GEE Asset
    Export.image.toAsset({
      image: normalized,
      description: 'Normalized_' + season + '_Season_Composite_' + year + '_' + item.startDate.format('YYYY-MM-dd').getInfo() + '_' + item.endDate.format('YYYY-MM-dd').getInfo(),
      assetId: 'users/janetmutuku/karamoja_s2_harmonized/Normalized_' + season + '_Season_' + item.startDate.format('YYYY-MM-dd').getInfo() + '_' + item.endDate.format('YYYY-MM-dd').getInfo(),
      scale: 10,
      crs: 'EPSG:4326',
      region: mining_buffer,
      maxPixels: 1e13
    });

    // Export composite to Google Drive
    Export.image.toDrive({
      image: normalized,
      description: 'Normalized_' + season + '_Season_Composite_' + year + '_' + item.startDate.format('YYYY-MM-dd').getInfo() + '_' + item.endDate.format('YYYY-MM-dd').getInfo(),
      folder: 'GEE_exports',
      fileNamePrefix: 'Normalized_' + season + '_Season_' + item.startDate.format('YYYY-MM-dd').getInfo() + '_' + item.endDate.format('YYYY-MM-dd').getInfo(),
      scale: 10,
      crs: 'EPSG:4326',
      region: mining_buffer,
      maxPixels: 1e13,
      fileFormat: 'GeoTIFF'
    });

    // Add composite to the map
    Map.addLayer(normalized, {bands: ['B4', 'B3', 'B2'], min: 0, max: 0.3}, 'Normalized_' + season + '_Season_' + item.startDate.format('YYYY-MM-dd').getInfo() + '_' + item.endDate.format('YYYY-MM-dd').getInfo(), false);
  });

  // Export whole year composite to GEE Asset
  var wholeYearStartDate = ee.Date.fromYMD(year, 1, 1);
  var wholeYearEndDate = ee.Date.fromYMD(year, 12, 31);
  var wholeYearComposite = ee.ImageCollection('COPERNICUS/S2_HARMONIZED')
                            .filterDate(wholeYearStartDate, wholeYearEndDate)
                            .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 10))
                            .map(maskS2clouds)
                            .median()
                            .clip(mining_buffer)
                            .select('B.*|QA.*');
  var normalizedWholeYearComposite = normalize(wholeYearComposite);

  Export.image.toAsset({
    image: normalizedWholeYearComposite,
    description: 'Normalized_Whole_Year_Composite_' + year,
    assetId: 'users/janetmutuku/karamoja_s2_harmonized/Normalized_Whole_Year_Composite_' + year,
    scale: 10,
    crs: 'EPSG:4326',
    region: mining_buffer,
    maxPixels: 1e13
  });

  // Export whole year composite to Google Drive
  Export.image.toDrive({
    image: normalizedWholeYearComposite,
    description: 'Normalized_Whole_Year_Composite_' + year,
    folder: 'GEE_exports',
    fileNamePrefix: 'Normalized_Whole_Year_Composite_' + year,
    scale: 10,
    crs: 'EPSG:4326',
    region: mining_buffer,
    maxPixels: 1e13,
    fileFormat: 'GeoTIFF'
  });

  // Add whole year composite to the map
  Map.addLayer(normalizedWholeYearComposite, {bands: ['B4', 'B3', 'B2'], min: 0, max: 0.3}, 'Normalized Whole Year Composite ' + year, false);
});

// Center the map on the mining buffer
Map.centerObject(mining_buffer, 10);





// var point = ee.Geometry.Point([34.663752, 2.556330]);
// var point2 = ee.Geometry.Point([34.845722, 2.405936]);
// var bufferDistance = 1000;
// var pointBuffer = point.buffer(bufferDistance);
// var pointBuffer2 = point2.buffer(100);

// //Cloud masking function
// function maskS2clouds(image) {
//   var qa = image.select('QA60');
//   var cloudBitMask = 1 << 10;
//   var cirrusBitMask = 1 << 11;
//   var mask = qa.bitwiseAnd(cloudBitMask).eq(0)
//             .and(qa.bitwiseAnd(cirrusBitMask).eq(0));
//   return image.updateMask(mask).divide(10000);
// }

// // Create season composites
// var cropCalendar = [[4, 9], [10, 3]];

// function createSeasonComposites(months, year) {
//   var startMonth = months[0];
//   var endMonth = months[1];
//   var startDate, endDate;

//   if (startMonth > endMonth) {
//     startDate = ee.Date.fromYMD(year, startMonth, 1);
//     endDate = ee.Date.fromYMD(year + 1, endMonth, 31);
//   } else {
//     startDate = ee.Date.fromYMD(year, startMonth, 1);
//     endDate = ee.Date.fromYMD(year, endMonth, 30);
//   }

//   print('Start Date:', startDate, 'End Date:', endDate);

//   // Load Sentinel-2 data and apply cloud masking
//   var im = ee.ImageCollection('COPERNICUS/S2_HARMONIZED')
//                       .filterDate(startDate, endDate)
//                       .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 5))
//                       .map(maskS2clouds);
//   var composite = im.median().clip(mining_buffer).select('B.*|QA.*');
//   return {composite: composite, startDate: startDate, endDate: endDate};
// }

// // Normalize image function
// function normalize(image) {
//   var bandNames = image.bandNames();
//   var minDict = image.reduceRegion({
//     reducer: ee.Reducer.min(),
//     geometry: mining_buffer,
//     scale: 10,
//     maxPixels: 1e13,
//     bestEffort: true,
//     tileScale: 16
//   });

//   var maxDict = image.reduceRegion({
//     reducer: ee.Reducer.max(),
//     geometry: mining_buffer,
//     scale: 10,
//     maxPixels: 1e13,
//     bestEffort: true,
//     tileScale: 16
//   });

//   var mins = ee.Image.constant(bandNames.map(function(b) {
//     var minValue = ee.Number(minDict.get(b));
//     return ee.Number(ee.Algorithms.If(minValue, minValue, 0));
//   }));

//   var maxs = ee.Image.constant(bandNames.map(function(b) {
//     var maxValue = ee.Number(maxDict.get(b));
//     return ee.Number(ee.Algorithms.If(maxValue, maxValue, 1));
//   }));

//   var normalized = image.subtract(mins).divide(maxs.subtract(mins));
//   return normalized;
// }

// // Define the range of years
// var years = Array.from({length: 7}, function(_, i) { return 2017 + i; });

// // Initialize an empty array to store composites
// var composites = [];

// // Loop through each year to create composites
// years.forEach(function(year) {
//   var compositeList = cropCalendar.map(function(months) {
//     return createSeasonComposites(months, year);
//   });

//   compositeList.forEach(function(item, index) {
//     var normalized = normalize(item.composite);
//     var season = index === 0 ? 'Rainy' : 'Dry';
    
//     composites.push({year: year, season: season, composite: normalized, startDate: item.startDate, endDate: item.endDate});
    
//     // Export composite to GEE Asset
//     Export.image.toAsset({
//       image: normalized,
//       description: 'Normalized_' + season + '_Season_Composite_' + year + '_' + item.startDate.format('YYYY-MM-dd').getInfo() + '_' + item.endDate.format('YYYY-MM-dd').getInfo(),
//       assetId: 'users/janetmutuku/karamoja_s2_harmonized/Normalized_' + season + '_Season_' + item.startDate.format('YYYY-MM-dd').getInfo() + '_' + item.endDate.format('YYYY-MM-dd').getInfo(),
//       scale: 10,
//       crs: 'EPSG:4326',
//       region: mining_buffer,
//       maxPixels: 1e13
//     });
    
//   // Export composite to Google Drive
//     Export.image.toDrive({
//       image: normalized,
//       description: 'Normalized_' + season + '_Season_Composite_' + year + '_' + item.startDate.format('YYYY-MM-dd').getInfo() + '_' + item.endDate.format('YYYY-MM-dd').getInfo(),
//       folder: 'GEE_exports',
//       fileNamePrefix: 'Normalized_' + season + '_Season_' + item.startDate.format('YYYY-MM-dd').getInfo() + '_' + item.endDate.format('YYYY-MM-dd').getInfo(),
//       scale: 10,
//       crs: 'EPSG:4326',
//       region: mining_buffer,
//       maxPixels: 1e13,
//       fileFormat: 'GeoTIFF'
//     });
//     // Add composite to the map
//     Map.addLayer(normalized, {bands: ['B4', 'B3', 'B2'], min: 0, max: 0.3}, 'Normalized_' + season + '_Season_' + item.startDate.format('YYYY-MM-dd').getInfo() + '_' + item.endDate.format('YYYY-MM-dd').getInfo(),false);
//   });

//   // Export whole year composite to GEE Asset
//   var wholeYearStartDate = ee.Date.fromYMD(year, 1, 1);
//   var wholeYearEndDate = ee.Date.fromYMD(year, 12, 31);
//   var wholeYearComposite = ee.ImageCollection('COPERNICUS/S2_HARMONIZED')
//                             .filterDate(wholeYearStartDate, wholeYearEndDate)
//                             .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 10))
//                             .map(maskS2clouds)
//                             .median()
//                             .clip(mining_buffer)
//                             .select('B.*|QA.*');
//   var normalizedWholeYearComposite = normalize(wholeYearComposite);

//   Export.image.toAsset({
//     image: normalizedWholeYearComposite,
//     description: 'Normalized_Whole_Year_Composite_' + year,
//     assetId: 'users/janetmutuku/karamoja_s2_harmonized/Normalized_Whole_Year_Composite_' + year,
//     scale: 10,
//     crs: 'EPSG:4326',
//     region: mining_buffer,
//     maxPixels: 1e13
//   });
  
  
//   // Export whole year composite to Google Drive
//   Export.image.toDrive({
//     image: normalizedWholeYearComposite,
//     description: 'Normalized_Whole_Year_Composite_' + year,
//     folder: 'GEE_exports',
//     fileNamePrefix: 'Normalized_Whole_Year_Composite_' + year,
//     scale: 10,
//     crs: 'EPSG:4326',
//     region: mining_buffer,
//     maxPixels: 1e13,
//     fileFormat: 'GeoTIFF'
//   });


//   // Add whole year composite to the map
//   Map.addLayer(normalizedWholeYearComposite, {bands: ['B4', 'B3', 'B2'], min: 0, max: 0.3}, 'Normalized Whole Year Composite ' + year,false);
// });

// // Center the map on the mining buffer
// Map.centerObject(mining_buffer, 10);











