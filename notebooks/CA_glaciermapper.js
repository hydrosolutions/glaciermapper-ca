//APPLICATION TO OBTAIN SNOW COVER INFORMATION OF RIVER BASINS IN CENTRAL ASIA

//Author: Silvan Ragettli
//-----------------------------------------------------------------//

// Correct Attribute of River Basin Shapefile:
var RiverBasins_2023_complex=ee.FeatureCollection('users/hydrosolutions/RiverBasins_CA_Jan2023');
var RiverBasins_2023=ee.FeatureCollection('users/hydrosolutions/RiverBasins_CA_Jan2023_simple1000');
var Regions_2023=ee.FeatureCollection('users/hydrosolutions/Regions_CA_Jan2023');
var RiverBasinsExtent=RiverBasins_2023.geometry();
var glims=ee.FeatureCollection("GLIMS/20230607").filter(ee.Filter.eq('geog_area', "Randolph Glacier Inventory; Umbrella RC for merging the RGI into GLIMS"));

RiverBasins_2023=RiverBasins_2023.map(function(ft){return ee.Feature(ft).set('NAME',ee.String(ee.Feature(ft).get('BASIN')).cat(ee.String('_')).cat(ee.String(ee.Feature(ft).get('CODE'))))});
var region_names=ee.List(['...']).cat(RiverBasins_2023.aggregate_array('REGION').distinct());
var catchment_names=ee.List(['...']).cat(RiverBasins_2023.aggregate_array('NAME').sort());

// Import external dependencies
var batch = require('users/fitoprincipe/geetools:batch');
var functions4cropmapper = require('users/hydrosolutions/public_functions:functions4cropmapper');

var layers_name=[ 
  'Decadal snow cover fraction',
  'Monthly snow water equivalents_ERA5-Land',
  'Annual first day of no snow',
  'Annual first day of no snow_TREND',
  'Monthly snow water equivalents_TerraClimate',  
  'Decadal snow line altitude',
     ];
     
var layers_source=[ 
  'MODIS',
  'ERA5-Land',
  'MODIS',
  'MODIS',
  'TerraClimate',  
  'MODIS',
     ];
var layers_source_URL=[ 
  'https://doi.org/10.5067/MODIS/MOD10A1.061',
  'https://doi.org/10.24381/cds.68d2bb30',
  'https://doi.org/10.5067/MODIS/MOD10A1.061',
  'https://doi.org/10.5067/MODIS/MOD10A1.061',
  'https://doi.org/10.1038/sdata.2017.191',  
  'https://doi.org/10.5067/MODIS/MOD10A1.061',
     ];     
     
var layers_resolution=[ 
  '500 m',
  '11132 m',
  '500 m',
  '500 m',
  '4638.3 meters',  
  '500 m',
     ];
var layers_download=[ 
  'projects/ee-hydro4u/assets/snow_CentralAsia/Monthly_snow_cover_fraction_until2022-12_Terra',
  'projects/ee-hydro4u/assets/snow_CentralAsia/Monthly_snow_water_equivalents_ERA5-Land_until2022-10',
  'projects/ee-hydro4u/assets/snow_CentralAsia/Annual_first_day_of_no_snow_until2022',
  'projects/ee-hydro4u/assets/snow_CentralAsia/Annual_first_day_of_no_snow_TREND_until2022',
  'projects/ee-hydro4u/assets/snow_CentralAsia/Monthly_snow_water_equivalents_TerraClimate_until2021-12',  
  'projects/ee-hydro4u/assets/snow_CentralAsia/Folder4SLA_v4',
     ]; 
     
// List all assets in the SLA folder
var assetList_SLA = ee.List(ee.data.listAssets(layers_download[5]).assets
  .map(function(asset) {
    var fc=ee.FeatureCollection(asset.name);
    return fc;
  }));
     
var variable_names=['value',
'value','value','value','value','value'];

var nameprefixes=['DecadalSCF','MonthlySWE','FirstDayOfNoSnow','FirstDayOfNoSnow','MonthlySWE','DecadalSLA'];
//-----------------------------------------------------------------//

//Define dates
var startDoy = 1;
var startYear = 2001;
var tileScaleValue = 1;
var point2sample = 500;
//intervals for decadal plot:
var intervals = 10;//decadal composites
//automatically identify current year, starting from August:
var thisyear; var thisyear_now;
if (new Date().getMonth()>=10){//August
  thisyear=new Date().getFullYear();
  thisyear_now=thisyear;
} else {
  thisyear=(new Date().getFullYear()) - 1;
  thisyear_now=(new Date().getFullYear());
}
var endYear = thisyear;
print('thisyear',thisyear);
var year_list=ee.List.sequence(startYear,ee.Number(thisyear)).map(function(nb){
        return {label: ee.String(ee.Number(nb).int()), value: nb};
  });
var year_list_client;
year_list.evaluate(function(result) {
  year_list_client=result;
});  

var time_intervals_all=ee.List(functions4cropmapper.extract_time_ranges(ee.List.sequence(startYear,thisyear_now - 1), intervals)
  .iterate(function(list, previous)
    {return ee.List(previous).cat(ee.List(list))},ee.List([])
  ));
var time_intervals_all2=ee.List(functions4cropmapper.extract_time_ranges(ee.List.sequence(thisyear_now,thisyear_now), intervals)
  .iterate(function(list, previous)
    {return ee.List(previous).cat(ee.List(list))},ee.List([])
  ));  
// print('time_intervals_all',time_intervals_all);
//-----------------------------------------------------------------//
var index_date = ee.Date(new Date());  // or ee.Date('2025-01-19') if fixed

// Iterate forward and truncate list at the first interval that starts after index_date
time_intervals_all2 = ee.List(time_intervals_all2.iterate(function(item, acc) {
  var accList = ee.List(acc);
  var startDate = ee.Date(ee.List(item).get(0));
  return ee.Algorithms.If(
    startDate.difference(index_date, 'day').lte(0),
    accList.add(item), // include this item
    accList // stop adding (truncate)
  );
}, ee.List([]))); // Start with an empty list
print('time_intervals_all2',time_intervals_all2);


var terraClimate=ee.ImageCollection("IDAHO_EPSCOR/TERRACLIMATE")
                .filter(ee.Filter.date(ee.Date.fromYMD(startYear, 1, 1), ee.Date.fromYMD(thisyear + 1, 1, 1)))
                .filterBounds(RiverBasinsExtent)
                .select("swe");
// print('terraClimate',terraClimate)

var lastdate=ee.Date(ee.Image(terraClimate.sort('system:time_start',false).first()).get('system:time_start'));
//the resolution of terraClimate is better than that of ERA5, but it is not readily available. So merge the two collections, with preference to terraClimate
// print('lastdate',lastdate)

//LOAD DATASET: ERA5 SWE
var era5_swe = ee.ImageCollection("ECMWF/ERA5_LAND/MONTHLY_AGGR")
//                .filter(ee.Filter.date(lastdate.advance(1,'day'), ee.Date.fromYMD(thisyear + 1, 1, 1)))
                .filter(ee.Filter.date(ee.Date.fromYMD(startYear, 1, 1), ee.Date.fromYMD(thisyear + 1, 1, 1)))
                .filterBounds(RiverBasinsExtent)
                .select("snow_depth_water_equivalent")
                .map(function(img){return ee.Image(img).rename('swe').multiply(1000)
                  .set('system:time_start',ee.Image(img).get('system:time_start'));
                });
// print('era5_swe',era5_swe);
// print('era5_swe',era5_swe.sort('system:time_start',false))

var visArgs_SWE = {
  bands: ['value'],
  min: 0, max: 100,
  palette: ['blue','white']
};

//LOAD DATASET: MODIS SCF
var modis_terra_sc = ee.ImageCollection("MODIS/061/MOD10A1").filterBounds(RiverBasinsExtent);
// Get the projection from the MODIS image to ensure consistency
var modisProjection;// = modis_terra_sc.first().select('NDSI_Snow_Cover').projection();
// print('MODIS projection:', modisProjection);
      
var modis_cc_func=function(x1){
  x1=ee.Image(x1);
  var mod=ee.Image(x1).select(['NDSI_Snow_Cover','NDSI_Snow_Cover_Class']);
  //get the modis acqua scene of the same day and use it to fill data gaps (NDSI_Snow_Cover_Class>=200)
  var myd_col = ee.ImageCollection("MODIS/061/MYD10A1").filterBounds(RiverBasinsExtent)
      .filterDate(mod.date(),mod.date().advance(1, 'day'));
      //.filterDate(ee.Date.fromYMD(startYear,1,ee.Date.fromYMD(2022,5,1))
  var myd=ee.Image(ee.Algorithms.If(myd_col.size().eq(0),/*ee.Image(255).rename('NDSI_Snow_Cover_Class').addBands(*/ee.Image().rename('NDSI_Snow_Cover'),ee.Image(myd_col.first()).select(['NDSI_Snow_Cover'/*,'NDSI_Snow_Cover_Class'*/])));
  //var image=mod.select('NDSI_Snow_Cover').min(myd).copyProperties(mod).set('system:time_start', mod.get('system:time_start'));
  var image=mod.select('NDSI_Snow_Cover').where(mod.select('NDSI_Snow_Cover_Class').gte(200),myd)
  return image;

};
var modis_scf = ee.ImageCollection(modis_terra_sc.map(function(img){ return modis_cc_func(img)}));
// print('modis_scf',modis_scf.first());
var mscf=modis_scf.map(function(x){
  var image=ee.Image(x).select('NDSI_Snow_Cover');
  return image;
});
var visArgs_FSC = {
  bands: ['value'],
  min: 0, max: 100,
  palette: ['blue','white']
};

//-----------------------------------------------------------------//
//First day of no snow algorithm:

// Define date bands
var startDate;
var startYear;

function addDateBands(img) {
  // Get image date.
  var date = img.date();
  // Get calendar day-of-year.
  var value = date.getRelative('day', 'year');
  // Get relative day-of-year; enumerate from user-defined startDoy.
  var relDoy = date.difference(startDate, 'day');
  // Get the date as milliseconds from Unix epoch.
  var millis = date.millis();
  // Add all of the above date info as bands to the snow fraction image.
  var dateBands = ee.Image.constant([value, relDoy, millis, startYear])
    .rename(['value', 'relDoy', 'millis', 'year']);
  // Cast bands to correct data type before returning the image.
  return img.addBands(dateBands)
    .cast({'value': 'int', 'relDoy': 'int', 'millis': 'long','year': 'int'})
    .set('millis', millis);
}
//3. Define an analysis mask
var waterMask = ee.Image('MODIS/MOD44W/MOD44W_005_2000_02_24')
  .select('water_mask')
  .not();
var completeCol = ee.ImageCollection("MODIS/061/MOD10A1")
  .select('NDSI_Snow_Cover');
// Pixels must have been 10% snow covered for at least 4% of the days over the entire period (previously: 2 weeks in 2018)
// 
//var snowCoverEphem = completeCol.filterDate('2018-01-01', '2019-01-01')
var snowCoverEphem = completeCol.filterDate(ee.Date.fromYMD(startYear,1,1), ee.Date.fromYMD(endYear,12,31))
  .map(function(img) {
    return img.gte(10);
  })
  .sum()
  //.gte(14);
  .gte((endYear + 1 - startYear)*365*4/100);

// Pixels must not be 10% snow covered more than 200 days in 2018.
var snowCoverConst = completeCol.filterDate('2018-01-01', '2019-01-01')
  .map(function(img) {
    return img.gte(10);
  })
  .sum()
  .lte(200);
var analysisMask = waterMask.multiply(snowCoverEphem).multiply(snowCoverConst);
/*Export.image.toAsset({
  image:analysisMask,
  scale: 500,
  description: 'Central_Asia_1stday_analysisMask',
  maxPixels: 1e13,
  region:RiverBasinsExtent.geometry(),
  assetId: 'users/hydrosolutions/Central_Asia_1stday_analysisMask',
});*/

analysisMask=ee.Image(ee.data.getAsset('users/hydrosolutions/Central_Asia_1stday_analysisMask').id);

//Identify the first day of the year without snow per pixel, per year
var years = ee.List.sequence(startYear, endYear);
var annualList = years.map(function(year) {
  // Set the global startYear variable as the year being worked on so that
  // it will be accessible to the addDateBands mapped to the collection below.
  startYear = year;
  // Get the first day-of-year for this year as an ee.Date object.
  var firstDoy = ee.Date.fromYMD(year, 1, 1);
  // Advance from the firstDoy to the user-defined startDay; subtract 1 since
  // firstDoy is already 1. Set the result as the global startDate variable so
  // that it is accessible to the addDateBands mapped to the collection below.
  startDate = firstDoy.advance(startDoy-1, 'day');
  // Get endDate for this year by advancing 1 year from startDate.
  // Need to advance an extra day because end date of filterDate() function
  // is exclusive.
  var endDate = startDate.advance(1, 'year').advance(1, 'day');
  // Filter the complete collection by the start and end dates just defined.
  var yearCol = completeCol.filterDate(startDate, endDate);
  // Construct an image where pixels represent the first day within the date
  // range that the lowest snow fraction is observed.
  var noSnowImg = yearCol
    // Add date bands to all images in this particular collection.
    .map(addDateBands)
    // Sort the images by ascending time to identify the first day without
    // snow. Alternatively, you can use .sort('millis', false) to
    // reverse sort (find first day of snow in the fall).
    .sort('millis')
    // Make a mosaic composed of pixels from images that represent the
    // observation with the minimum percent snow cover (defined by the
    // NDSI_Snow_Cover band); include all associated bands for the selected
    // image.
    .reduce(ee.Reducer.min(5))
    // Rename the bands - band names were altered by previous operation.
    .rename(['snowCover', 'value', 'relDoy', 'millis', 'year'])
    // Apply the mask.
    .updateMask(analysisMask)
    // Set the year as a property for filtering by later.
    .set('year', year);

  // Mask by minimum snow fraction - only include pixels that reach 0
  // percent cover. Return the resulting image.
  return noSnowImg.updateMask(noSnowImg.select('snowCover').eq(0));
});
var annualCol = ee.ImageCollection.fromImages(annualList);
//Data summary and visualization

//Single-year map
// Define visualization arguments.
var palette1=['0D0887', '5B02A3', '9A179B', 'CB4678', 'EB7852', 'FBB32F', 'F0F921'];
var visArgs_single = {
  bands: ['value'],
  min: 0,
  max: 220,
  palette: palette1};

//Year-to-year difference map (CURRENTLY NOT IN USE)
// Define the years to difference.
var firstYear = 2005;
var secondYear = 2015;

// Calculate difference image.
var firstImg = annualCol.filter(ee.Filter.eq('year', firstYear))
  .first().select('value');
var secondImg = annualCol.filter(ee.Filter.eq('year', secondYear))
  .first().select('value');
var dif = secondImg.subtract(firstImg);

// Define visualization arguments.

//Trend analysis map
// Calculate slope image.
var slope = annualCol.sort('year').select(['year', 'value'])
  .reduce(ee.Reducer.linearFit()).select('scale');

// Define visualization arguments.
var palette2 = ['b2182b', 'ef8a62', 'fddbc7', 'f7f7f7','d1e5f0', '67a9cf', '2166ac'];
var visArgs_trend = {
  min: -1,
  max: 1,
  palette: palette2};

//-----------------------------------------------------------------//

//Time series chart

// Function to calculate annual mean DOY of AOI.
var get_AoiMean= function(aoi,imcol,reducer,tilescale){
  reducer=ee.Reducer(reducer);
  imcol=ee.ImageCollection(imcol);
  return ee.ImageCollection(imcol).map(function(img) {
    var summary = img.reduceRegion({
      reducer: reducer,
      geometry: aoi,
      scale: 1e3,
      bestEffort: true,//comment out when exporing!
      maxPixels: 1e14,
      tileScale: tilescale,
    });
    return ee.Feature(null, summary).set('year', img.get('year')).set('system:time_start', img.get('system:time_start'));
  });
};

// Function to calculate annual mean DOY of AOI, but only based on a sample of 1000 pixels (may prevent 'User memory limit exceeded').
var get_AoiMean_sample= function(aoi,imcol,reducer,tilescale){
  reducer=ee.Reducer(reducer);
  imcol=ee.ImageCollection(imcol);
  var samplePoints = ee.Image(0).sample({
        region:aoi,
        numPixels: 1000,
        tileScale: 1,
        scale: 1e3,
        geometries: true,
        dropNulls: false
      });
  //print('samplePoints',samplePoints);
  return ee.ImageCollection(imcol).map(function(img) {
    var summary = img.reduceRegion({
      reducer: reducer,
      geometry: samplePoints.geometry(),
      scale: 1e3,
      tileScale: 2,
    });          
    return ee.Feature(null, summary).set('system:time_start', img.get('system:time_start'))
      .set('Year-Month-Day',ee.Date(img.get('system:time_start')).format('YYYY-MM-dd'));
  });
};

// Print chart to console.
var get_chart = function(AoiMean,yProperties){
  return ui.Chart.feature.byFeature(AoiMean, variables[layer],yProperties)//
  .setOptions({
    title: charttitle[layer],
    // legend: {position: 'none'},
    trendlines: {0: { 
      color: 'blue',
      lineWidth: 10,
      opacity: 0.2,
      labelInLegend: 'Trendline',
      showR2: true,
      visibleInLegend: true
    }},
    hAxis: {
      title: hAxistitle[layer],
      format: hAxisformat[layer]
    },
    vAxis: {title: axistitle[layer], minValue:0}});
};

var get_lt_chart = function(long_term_values,AoiMean_thisyear,AoiMean_previousyear,yProperties){
  return ui.Chart.feature.byFeature(ee.FeatureCollection([long_term_values,AoiMean_previousyear,AoiMean_thisyear]).flatten(), variables[layer],['amonthly',yProperties +(thisyear_now - 1),yProperties])
  // .setChartType('ScatterChart')
  .setOptions({
      hAxis: {
        title: hAxistitle[layer],
          format: hAxisformat2[layer],//titleTextStyle:{fontSize: 12}
          viewWindowMode: 'maximized',gridlines: { count: 12 }},//,textStyle:{fontSize: 10}
      lineWidth: 1,
      pointSize: 2,
      // legend: {position:"top",textStyle:{fontSize: 10}},
      // fontSize: 22,
      series: {
        0: {color: 'blue',labelInLegend: 'Average 2001-2022',lineWidth: 2,opacity: 0.2},
        1: {color: '#008000',labelInLegend: ' Year ' + (thisyear_now - 1)},
        2: {color: 'red',pointShape: 'diamond',labelInLegend: ' Year ' + thisyear_now}, 
        },
      title: charttitle3[layer],
    // legend: {position: 'none'},
      vAxis: {title: axistitle[layer], minValue:0}
  });
};

//Chart for selected pixels, after clicking on map
var get_chart_point = function(annualAoiPoint){
  return ui.Chart.feature.byFeature(annualAoiPoint, variables[layer], 'value')
  .setOptions({
    title: charttitle2[layer],
    legend: {position: 'none'},
    trendlines: {0: { 
      color: 'blue',
      lineWidth: 10,
      opacity: 0.2,
      labelInLegend: 'Trendline',
      showR2: true,
      visibleInLegend: true
    }},
    hAxis: {
      title: hAxistitle[layer],
      format: hAxisformat[layer]
    },
    vAxis: {title: axistitle[layer], minValue:0}});
};
var chartpanel1=ui.Panel({widgets: []});//for time series per basin
var chartpanel3=ui.Panel({widgets: []});//for long term average and current year
var chartpanel2=ui.Panel({widgets: []});//for point of interest
var chartpanel=ui.Panel({widgets: [chartpanel1,chartpanel3,chartpanel2],layout: ui.Panel.Layout.flow('vertical')});

//-----------------------------------------------------------------//

///DEFINE UI ELEMENTS

//selection panel
var selectionPanel = ui.Panel({
  // Create a panel with vertical flow layout.
    layout: ui.Panel.Layout.flow('vertical'),
    style: {/*width: "500px",*/border: '1px solid black'},
    widgets: []
});

//Map
var uiMap = ui.Map();
uiMap.setOptions("HYBRID");
uiMap.style().set('cursor', 'crosshair');
uiMap.centerObject(RiverBasinsExtent);
var d = ee.Image().paint(RiverBasins_2023_complex, 0, 2);
uiMap.layers().set(0,ui.Map.Layer(d,null,'River Basins'));//placeholder
uiMap.layers().set(1,ui.Map.Layer(d,null,'River Basins'));
uiMap.layers().set(2,ui.Map.Layer(ee.Image().paint(glims.filterBounds(RiverBasins_2023),0,2),{palette:'cyan'},'Glaciers'));
uiMap.layers().set(3,ui.Map.Layer(ee.Image().paint(glims.filterBounds(RiverBasins_2023),0,2),{palette:'cyan'},'Glaciers',false));

//Panel on left side of screen.
//ui.root.widgets().reset([selectionPanel,uiMap]);
var splitPanel1 = ui.SplitPanel({
  firstPanel: selectionPanel,
  secondPanel: uiMap,
  //wipe: true,
});
splitPanel1.getFirstPanel().style().set('width','500px');

ui.root.widgets().reset([splitPanel1]);

//Logo
var Logo_HydroSolutions= ee.Image("projects/ee-hsol/assets/logo_hsol_projected").resample('bicubic').resample('bicubic');
//print('Logo_HydroSolutions',Logo_HydroSolutions);
var logo_hsol=ui.Thumbnail({
  image:Logo_HydroSolutions,//,
  params:{bands:['b1','b2','b3'],
  min:0,max:255},
  //onClick: hydrosolutions.getUrl(),
  style:{width:'140px',height:'auto', margin: 'auto',padding: '10px'}});

var hydrosolutions = ui.Label({ value : "hydrosolutions.ch", style : { shown:true ,color:'blue', fontWeight: '600', fontSize: '13px',margin: '4px 1px 2px 5px',height:'12px'}, 
  targetUrl : "https://www.hydrosolutions.ch"  } );

var Logos_PANEL=ui.Panel({
    style: {
    width: '150px',
    height: 'auto',
    padding: '5px',
    position: 'bottom-right'
    },
    widgets:[logo_hsol,hydrosolutions]
  });
//var hydrosolutions_manual=ui.Panel({widgets: [hydrosolutions/*,manual*/],layout: ui.Panel.Layout.flow('vertical'),style: {position: 'bottom-right',/*height: '22px',*/padding:"2px"}});
uiMap.add(Logos_PANEL);

//Legend
// set position of panel
var legend = ui.Panel({
  style: {
    position: 'top-right',
    padding: '1px 1px'
  }
});
var legend_subpanel = ui.Panel({
  style: {
    padding: '0px'
  }
});
// Create legend title
var legendTitle = ui.Label({
  value: 'Legend',
  style: {
    fontWeight: 'bold',
    fontSize: '16px',
    margin: '0 0 1px 0',
    padding: '0',
    maxWidth: '75px'
    }
});
legend.add(legendTitle);
// create the legend image
var lon = ee.Image.pixelLonLat().select('latitude');
// print('lon max',lon)
// create vizualization parameters
var viz = {min: 0, max: 100, palette: palette1};
var gradient = lon.multiply((viz.max-viz.min)/100.0).add(viz.min);
var legendImage = gradient.visualize(viz);
// create text on top of legend
var legend_max = ui.Label(viz.max + ' ', {fontWeight: '450', fontSize: '15px', margin: '0px 1px 1px 1px'});
legend_subpanel.add(legend_max);
// create thumbnail from the image
var thumbnail = ui.Thumbnail({
image: legendImage,
params: {bbox:'0,0,10,100', dimensions:'20x50'},
style: {padding: '0px', position: 'bottom-center'}
});
// add the thumbnail to the legend
legend_subpanel.add(thumbnail);
// create text on top of legend
var legend_min = ui.Label(viz.min, {fontWeight: '450', fontSize: '15px', margin: '0px 1px 1px 1px'});
legend_subpanel.add(legend_min);

// Visualize the border as black
var thumbnail_basin = ui.Thumbnail({
  image: ee.Image(1).visualize({min: 1, max: 1, palette: ['black']}),
  params: {bbox:'0,0,10,100', dimensions:'18x18'},
  style: {padding: '0px', margin: '1px 1px 1px 8px'}
});

var panel_basin_legend=ui.Panel([ui.Label('River Basins', {fontWeight: '450', fontSize: '14px', margin: '1px 1px 1px 1px'})
  ,thumbnail_basin], ui.Panel.Layout.Flow('horizontal'));    

legend.add(panel_basin_legend);

var thumbnail_glacier = ui.Thumbnail({
  image: ee.Image(1).visualize({min: 1, max: 1, palette: ['cyan']}),
  params: {bbox:'0,0,10,100', dimensions:'18x18'},
  style: {padding: '0px', margin: '1px 1px 1px 8px'}
});
var panel_glacier_legend=ui.Panel([ui.Label('Glaciers', {fontWeight: '450', fontSize: '14px', margin: '1px 1px 1px 1px'})
  ,thumbnail_glacier], ui.Panel.Layout.Flow('horizontal'));    

legend.add(panel_glacier_legend);

var thumbnail_SL = ui.Thumbnail({
  image: ee.Image(1).visualize({min: 1, max: 1, palette: ['red']}),
  params: {bbox:'0,0,10,100', dimensions:'18x18'},
  style: {padding: '0px', margin: '1px 1px 1px 8px'}
});
var panel_SL_legend=ui.Panel([ui.Label('Snowline', {fontWeight: '450', fontSize: '14px', margin: '1px 1px 1px 1px'})
  ,thumbnail_SL], ui.Panel.Layout.Flow('horizontal'));    

uiMap.add(legend);

var viz1 = {min: 2, max: 0, palette: palette2};
var legendImage_trend = ee.Image.pixelLonLat().select('latitude').multiply((viz1.max-viz1.min)/100.0).add(viz1.min).visualize(viz1);


//OPACITY SLIDER
var slider = ui.Slider({style: {stretch: 'both',width:'80px',fontWeight: '450', fontSize: '12px', margin: '1px 1px 1px 1px'}}).setValue(0);
slider.onSlide(function(value) {
  uiMap.layers().get(0).setShown(true);
  uiMap.layers().get(0).setOpacity(value);
});
var sliderPanel = ui.Panel({style :{position : "top-right",width: "130px"}});//
sliderPanel.widgets().set(0,ui.Label('Opacity Slider', {fontWeight: '450', fontSize: '14px', margin: '1px 1px 1px 1px'}));
sliderPanel.widgets().set(1,slider);

//Dateslider for selecting a month for SCF
var selected_fsc;
var mm_yyyy= 12 + '_' + thisyear;
var mm_yyyy_previous=mm_yyyy; var selected_date;
var dateslider= ui.DateSlider({start:ee.Date(ee.List(time_intervals_all.get(0)).get(0)), end: ee.Date(ee.List(time_intervals_all.reverse().get(0)).get(0)).advance(15,'day'), 
  value: ee.Date(ee.List(time_intervals_all.reverse().get(0)).get(0)), period: 1, onChange:
    function(range){
      slider.setValue(1,false);
      checkbox2download.setValue(false,false);
      var yr=ee.Number(range.start().get('year'));
      var mn=ee.String('00').cat(ee.String(ee.Number(range.start().get('month')).toShort())).slice(-2);//leading zeroes
      var d0=ee.Number(range.start().get('day'));
      d0=ee.Number(ee.Algorithms.If(d0.lt(11),1,ee.Algorithms.If(d0.lt(21),11,21)));
      d0=ee.Number(ee.Algorithms.If(ee.Number(range.start().get('month')).eq(2).and(d0.eq(11)),10,
        ee.Algorithms.If(ee.Number(range.start().get('month')).eq(2).and(d0.eq(21)),19,d0)));
      var dd=ee.String('00').cat(ee.String(d0.toShort())).slice(-2);//leading zeroes
      var mm_yyyy_server=dd.cat(ee.String('_')).cat(mn).cat(ee.String('_')).cat(ee.String(yr.toShort()));
      mm_yyyy_server.evaluate(function(result){
        mm_yyyy=result;
        print('selected date',ee.String(yr.toShort()).cat(ee.String('-')).cat(mn).cat(ee.String('-')).cat(dd));
        selected_fsc=ee.Image(selected_ic.filter(ee.Filter.eq('Year-Month-Day',ee.String(yr.toShort()).cat(ee.String('-')).cat(mn).cat(ee.String('-')).cat(dd))).first());
        // print('selected imgs',selected_ic.filterDate(range.start().advance(-15,'day'),range.end().advance(15,'day')));
        // print('selected imgs',selected_ic.filter(ee.Filter.eq('Year-Month-Day',ee.String(yr.toShort()).cat(ee.String('-')).cat(mn).cat(ee.String('-')).cat(dd))));
        map2download=selected_fsc;
        if (mm_yyyy_previous != mm_yyyy){
          uiMap.layers().set(0,ui.Map.Layer(selected_fsc, visArgs_FSC, nameprefix + mm_yyyy));
          if (started===0){
            uiMap.layers().get(0).setShown(false);
            started=1;
            legend.add(legend_subpanel);
            uiMap.remove(sliderPanel);
            uiMap.add(sliderPanel);
            slider.setValue(0,false);
          }
        }
        var zmax=3;
        
        selected_date=new Date(dateslider.getValue()[0]).toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        });
        // if (layer===0 || layer==5 ){//Decadal layers
        
          if (iteration_id_tmp2>0){
            iteration_id=iteration_id + 1;
            var iteration_id_tmp1=iteration_id;
            //current snowline
            get_sla_ic();
            var img = sla_ic.filterDate(range.start().advance(-15,'day'),range.start()).sort('system:time_start', false).first();
            modisProjection = img.projection();
            dem4SLA(aoi_glacier);
            modis_SLA(img,aoi_glacier,null);
            // print('rr2.toDictionary()',rr2.toDictionary());
            var sla_mean=rr2.select(aspectKeys.slice(0,-1)).toDictionary().values().reduce(ee.Reducer.mean());
            // var sla_min=rr2.select(aspectKeys.slice(0,-1)).toDictionary().values().reduce(ee.Reducer.min());
            // var sla_max=rr2.select(aspectKeys.slice(0,-1)).toDictionary().values().reduce(ee.Reducer.max());
            // var gla_sla_range=ee.Number(sla_min).format('%.0f').cat(ee.String('-')).cat(ee.Number(sla_max).format('%.0f').cat(ee.String(' m asl.')));
            var gla_sla_range=ee.Number(sla_mean).divide(10).round().multiply(10).format('%.0f').cat(ee.String(' m asl. (N: '))
              .cat(ee.Number(rr2.get('North')).divide(10).round().multiply(10).format('%.0f')).cat(ee.String(', E: '))
              .cat(ee.Number(rr2.get('East')).divide(10).round().multiply(10).format('%.0f')).cat(ee.String(', S: '))
              .cat(ee.Number(rr2.get('South')).divide(10).round().multiply(10).format('%.0f')).cat(ee.String(', W: '))
              .cat(ee.Number(rr2.get('West')).divide(10).round().multiply(10).format('%.0f'))/*.cat(ee.String(', mixed: '))
              .cat(ee.Number(rr2.get('mixed')).divide(10).round().multiply(10).format('%.0f'))*/.cat(ee.String(')'));
            // var noglacier_label=ui.Label('No glacier at selected point', {color: 'red',height: '29px',margin: '15px 1px 1px 10px'});  
            // print('gla_sla_range',gla_sla_range);
            gla_sla_range_label.setValue('');
            gla_scf_label.setValue('');
            panel_glacier_details.remove(plz_wait0);
            panel_glacier_details.add(plz_wait0);
   
            gla_sla_range.evaluate(function(gla_sla_range_client){
              if (iteration_id_tmp1==iteration_id){//in case the user has already moved forward...
                panel_glacier_details.remove(gla_sla_range_label);
                panel_glacier_details.add(gla_sla_range_label);
                gla_sla_range_label.setValue(selected_date +' Basin Snowline: '+gla_sla_range_client);
                panel_glacier_details.remove(plz_wait0);
              }
            });
            if (glacier_selected==1){
              modis_SLA(img,aoi_glacier,glims.filterBounds(point1));
              ee.Number(glims_fsc).multiply(100).format('%.1f').evaluate(function(glims_fsc_client){
                if (iteration_id_tmp1==iteration_id){//in case the user has already moved forward...
                  panel_glacier_details.remove(gla_scf_label);
                  panel_glacier_details.add(gla_scf_label);
                  gla_scf_label.setValue(selected_date+' Glacier Snow Cover Fraction: '+glims_fsc_client + '%');
                }
              });
            }
          }
        // }
        
        if (layer ==5 ) {
          zmax=4;
          
          if (basin_selected !== null){
            modisProjection = selected_fsc.projection();
            dem4SLA(aoi);
            modis_SLA(selected_fsc,aoi,glims.filterBounds(aoi));
            modis_SLAdisplay(sla_image);
            
          } else{
            zmax=3;
          }
        }        
  
        mm_yyyy_previous=mm_yyyy;
        var zIndex = uiMap.layers().length();
        for (var i=zIndex-1; i>zmax; i--) {
          uiMap.remove(uiMap.layers().get(i));
        }
    });
  }, style:{position: 'top-left',}});
var endDate=ee.Date(ee.Image(modis_scf.filter(ee.Filter.calendarRange(thisyear_now,thisyear_now,'year')).sort('system:time_start',false).first()).get('system:time_start'));

//function that defines what happens when clicking on map
var mapclick;
var task_click1= ui.util.debounce( function(imgcol) {//debounce, bcs task_click2 needs to be executed first, to respect order of widgets adding
  imgcol=ee.ImageCollection(imgcol);
  uiMap.style().set('cursor', 'crosshair');
  mapclick = uiMap.onClick(function(coords) {
    point1 = ee.FeatureCollection(ee.Geometry.Point(coords.lon, coords.lat));
    // uiMap.layers().set(4, poi_map_layer);
    var AoiMean_point = ee.FeatureCollection(get_AoiMean(point1.geometry(),imgcol,ee.Reducer.first(),tileScaleValue));
    //check if the requested properties are available at this point:
    var c=ee.Feature(AoiMean_point.toList(1).get(0)).propertyNames();
    // print('c',c);
    var plz_wait=ui.Label('Generating Chart. Please wait...', {color: 'red',height: '29px',margin: '15px 1px 1px 10px'});
    chartpanel2.widgets().set(2,plz_wait);
    // Get chart and print chart to console.
    c.indexOf("value").evaluate(function(result) {
      if (result==-1){ // "value" missing
        chartpanel2.widgets().set(2,ui.Label('No ' + getSelectedLayer().replace(/ /g,'-') + ' data available at selected point', {color: 'red',height: '29px',margin: '15px 1px 1px 10px'}));
      } else {
        var chart=get_chart_point(AoiMean_point);
        chartpanel2.widgets().set(2,chart);
        chartpanel2.remove(plz_wait);
      }});
  });
},10);
var mapclick2;
var gla_sla_range_label=ui.Label('', {fontSize: '12px'});
var gla_scf_label=ui.Label('', {fontSize: '12px'});
var panel_glacier_details=ui.Panel({widgets: [],layout: ui.Panel.Layout.flow('vertical')});
var aoi_glacier=ee.Feature(null); var glacier_selected=0; var point1; var iteration_id=0; var iteration_id_tmp2=0
var plz_wait0=ui.Label('Please wait...', {color: 'red',height: '29px',margin: '15px 1px 1px 10px'});
var task_click2=  function() {
  uiMap.style().set('cursor', 'crosshair');
  mapclick2=uiMap.onClick(function(coords) {
    iteration_id=iteration_id + 1;
    iteration_id_tmp2=iteration_id;
    point1 = ee.FeatureCollection(ee.Geometry.Point(coords.lon, coords.lat));
    // print('glims',glims.filterBounds(point1));
    var poi_map_layer=ui.Map.Layer(point1.style({pointShape: 'triangle',pointSize:10,color:'black',fillColor : 'white'}), {},"Point of Interest");
    if (layer == 5 & basin_selected !== null){
      uiMap.layers().set(5, poi_map_layer);
    } else {uiMap.layers().set(4, poi_map_layer);
    }
    var plz_wait=ui.Label('Collecting data on selected glacier. Please wait...', {color: 'red',height: '29px',margin: '15px 1px 1px 10px'});
    chartpanel2.widgets().set(0,ui.Label('Point of Interest', {fontWeight: '450', fontSize: '16px',height: '29px',margin: '15px 1px 1px 10px'}));
    // chartpanel2.widgets().set(1,plz_wait);
    // Get chart and print chart to console.
    
    panel_glacier_details.clear();
    panel_glacier_details.add(plz_wait0);

    // if (basin_selected===null){
    var iteration_id_tmp1=iteration_id;
    aoi_glacier=ee.Feature(RiverBasins_2023.filterBounds(point1).sort('area_km2').first());
    ee.String(aoi_glacier.get('NAME')).evaluate(function(basinname_client){
      if (iteration_id_tmp1==iteration_id && iteration_id_tmp2==iteration_id){//in case the user has already moved forward...
        panel_glacier_details.add(ui.Label('Basin: '+basinname_client, {fontSize: '12px'}));
      }
    });
    aoi_glacier=aoi_glacier.geometry();

    // }
    chartpanel2.remove(panel_glacier_details);
    chartpanel2.widgets().set(1,panel_glacier_details);
    
    //current snowline
    get_sla_ic();
    var ddate=ee.Date(new Date(dateslider.getValue()[0]));
    var img = sla_ic.filterDate(ddate.advance(-15,'day'),ddate).sort('system:time_start', false).first();
    modisProjection = img.projection();
    dem4SLA(aoi_glacier);
    modis_SLA(img,aoi_glacier,null);
    // print('rr2.toDictionary()',rr2.toDictionary());
    var sla_mean=rr2.select(aspectKeys.slice(0,-1)).toDictionary().values().reduce(ee.Reducer.mean());
    // var sla_min=rr2.select(aspectKeys.slice(0,-1)).toDictionary().values().reduce(ee.Reducer.min());
    // var sla_max=rr2.select(aspectKeys.slice(0,-1)).toDictionary().values().reduce(ee.Reducer.max());
    // var gla_sla_range=ee.Number(sla_min).format('%.0f').cat(ee.String('-')).cat(ee.Number(sla_max).format('%.0f').cat(ee.String(' m asl.')));
    var gla_sla_range=ee.Number(sla_mean).divide(10).round().multiply(10).format('%.0f').cat(ee.String(' m asl. (N: '))
      .cat(ee.Number(rr2.get('North')).divide(10).round().multiply(10).format('%.0f')).cat(ee.String(', E: '))
      .cat(ee.Number(rr2.get('East')).divide(10).round().multiply(10).format('%.0f')).cat(ee.String(', S: '))
      .cat(ee.Number(rr2.get('South')).divide(10).round().multiply(10).format('%.0f')).cat(ee.String(', W: '))
      .cat(ee.Number(rr2.get('West')).divide(10).round().multiply(10).format('%.0f'))/*.cat(ee.String(', mixed: '))
      .cat(ee.Number(rr2.get('mixed')).divide(10).round().multiply(10).format('%.0f'))*/.cat(ee.String(')'));
    // var noglacier_label=ui.Label('No glacier at selected point', {color: 'red',height: '29px',margin: '15px 1px 1px 10px'});  
    // print('gla_sla_range onclick',gla_sla_range);
    gla_sla_range.evaluate(function(gla_sla_range_client){
      if (iteration_id_tmp1==iteration_id && iteration_id_tmp2==iteration_id){//in case the user has already moved forward...
        panel_glacier_details.remove(gla_sla_range_label);
        panel_glacier_details.add(gla_sla_range_label);
        if (enddate_client==selected_date){
          gla_sla_range_label.setValue('Current ('+enddate_client+') Basin Snowline: '+gla_sla_range_client);
        } else {
          gla_sla_range_label.setValue(selected_date +' Basin Snowline: '+gla_sla_range_client);
        }
        panel_glacier_details.remove(plz_wait);
        panel_glacier_details.add(plz_wait);
      }
    });   
    whitespacepanel.style().set('shown', false);
    glims.filterBounds(point1).size().evaluate(function(result) {
      panel_glacier_details.remove(plz_wait0);
      panel_glacier_details.remove(plz_wait);
      panel_glacier_details.add(plz_wait);
      if (result===0){ // "value" missing
        // panel_glacier_details.remove(noglacier_label);
        // panel_glacier_details.add(noglacier_label);
        plz_wait.setValue('No glacier at selected point');
        glacier_selected=0;
      } else {
        glacier_selected=1;
        var glaciers=glims.filterBounds(point1);
        modis_SLA(img,aoi_glacier,glaciers);
        var glacier=glaciers.first();
        if (basin_selected===null){
          var layerGeometry = ui.Map.Layer( ee.Image().paint(glaciers,0, 2), {palette: 'yellow'},'Selected Glacier');
            if (uiMap.getZoom() < 9){
              // print('middleMap.getZoom()',uiMap.getZoom());
              uiMap.centerObject(glaciers.geometry().buffer(10000,100));
            }
          uiMap.layers().set(3,layerGeometry);           
        }
        var glaname=ee.String(glacier.get('glac_id'));
        //area
        var gla_area=glacier.geometry().area().divide(1e6);//in km2
        gla_area.format('%.2f').evaluate(function(gla_area_client){
          if (iteration_id_tmp1==iteration_id && iteration_id_tmp2==iteration_id){//in case the user has already moved forward...
            panel_glacier_details.add(ui.Label('Glacier Area: '+gla_area_client + ' km²', {fontSize: '12px'}));
          }
        });
        //elevation range
        var gla_ele_range=ee.Number(glacier.get('min_elev')).format('%.0f').cat(ee.String('-')).cat(ee.Number(glacier.get('max_elev')).format('%.0f').cat(ee.String(' m asl.')));
        gla_ele_range.evaluate(function(gla_ele_range_client){
          if (iteration_id_tmp1==iteration_id && iteration_id_tmp2==iteration_id){//in case the user has already moved forward...
            panel_glacier_details.add(ui.Label('Glacier Elevation Range: '+gla_ele_range_client, {fontSize: '12px'}));
          }
        });
     
        //fractional SC
        var glacier_fsc=glims_fsc;
        // print('glims_fsc',glims_fsc)
        ee.Number(glims_fsc).multiply(100).format('%.1f').evaluate(function(glims_fsc_client){
          if (iteration_id_tmp1==iteration_id && iteration_id_tmp2==iteration_id){//in case the user has already moved forward...
            panel_glacier_details.remove(gla_scf_label);
            panel_glacier_details.add(gla_scf_label);
            if (enddate_client==selected_date){
              gla_scf_label.setValue('Current ('+enddate_client+') Glacier Snow Cover Fraction: '+glims_fsc_client + '%');
            } else {
              gla_scf_label.setValue(selected_date+' Glacier Snow Cover Fraction: '+glims_fsc_client + '%');
            }
            panel_glacier_details.remove(plz_wait);
            panel_glacier_details.add(plz_wait);
          }
          plz_wait.setValue(' ');
        });
        //
        glaname.evaluate(function(glaname_client){
          if (iteration_id_tmp1==iteration_id && iteration_id_tmp2==iteration_id){//in case the user has already moved forward...
            panel_glacier_details.add(ui.Label('Randolph Glacier ID: '+glaname_client, {fontSize: '12px'}));
          }
        });


      // print('glims_fsc', glims_fsc); print('glims_fsc_below_sl',glims_fsc_below_sl); 
      // print('glims_area_below_sl',glims_area_below_sl);        
        
      }});
  });
};

var rr1; var rr2; var sla_image; var stratifiedSamples; var fsc; var rr2_count; var samplePoints;
var glims_fsc; var glims_fsc_below_sl; var glims_area_below_sl; var glims_scf_below_sl_img;
var n_grid;
// Define the keys
var aspectKeys = ['East', 'North', 'South', 'West', 'mixed'];

var cannyThreshold = 0.7;
var cannySigma = 0.7;
var scale = 500;
var sc_th=50;
var scale_dem=500;
// Get the DEM and properly reproject it to match MODIS resolution and projection
var dem = ee.ImageCollection("JAXA/ALOS/AW3D30/V4_1").select("DSM");
dem = dem.mosaic().setDefaultProjection(dem.first().select(0).projection());
      
//function to display the snowline altitude
var modis_SLAdisplay=function(image){
      // print('rr perc10', rr1);
      // print('samplePoints',samplePoints);
      // print('rr median sampled',ee.Feature(ee.List.sequence(0,4).iterate(function(x,previous){
      //   return ee.Feature(previous).set(ee.List(aspectKeys).get(ee.Number(x)),
      //     samplePoints.filter(ee.Filter.eq('mixed',ee.Number(x).add(1))).aggregate_array('DSM').reduce(ee.Reducer.median()));
      // },ee.Feature(null))));
      // print('rr median', rr2);
      // print('number of grid cells',n_grid);        
      // print('rr2_count', rr2_count);
      // print('fsc', fsc);
      // print('stratifiedSamples',stratifiedSamples);      
      // print('glims area', glims.filterBounds(aoi).geometry().intersection(aoi).area().divide(1e6));
      // print('glims_fsc', glims_fsc); print('glims_fsc_below_sl',glims_fsc_below_sl); 
      // print('glims_area_below_sl',glims_area_below_sl);

      // Display layers
      // uiMap.layers().set(3,ui.Map.Layer(ee.Image().paint(glims.filterBounds(aoi),0,2),{palette:'cyan'},'Glaciers'));
      uiMap.layers().set(4, ui.Map.Layer(image.gt(0), {min:0, max:1, palette:'yellow,red'}, 'Snowline'));
      // uiMap.layers().set(5, ui.Map.Layer(glims_scf_below_sl_img.gte(0).multiply(dem).clip(aoi), {min:1000, max:3000, palette:'yellow,red'}, 'glims_scf_below_sl_img ' + thisyear));
            // // Assign numeric codes with correct projection
      // var aspect_coded = ee.Image(0)
      //   .where(aspects.select('North').eq(1), 1)
      //   .where(aspects.select('East').eq(1), 2)
      //   .where(aspects.select('South').eq(1), 3)
      //   .where(aspects.select('West').eq(1), 4)
      //   .updateMask(reprojectedDEM.mask())  // Use the reprojected DEM mask
      //   .rename('aspect_code')
      //   .reproject({
      //     crs: modisProjection,
      //     scale: scale
      //   });
      //   //
      // uiMap.layers().set(6, ui.Map.Layer(ee.Terrain.aspect(dem).subtract(45), {min:-45, max:315, palette:'green,cyan,black,magenta'}, 'aspect', false));
      // uiMap.layers().set(7, ui.Map.Layer(aspect_coded, {min:0, max:4, palette:'white,green,cyan,black,magenta'}, 'aspect_coded', false));
};

var reprojectedDEM; var minDEM;var maxDEM; var aspects; var aspect_coded;
//function to process DEM before calculating the snowline altitude
var dem4SLA=function(aoi){
      // First reproject the DEM to the MODIS projection with the MODIS scale
      reprojectedDEM = dem.reduceResolution({
        reducer: ee.Reducer.mean(),
        // bestEffort: true,
          maxPixels: 1024,
      }).reproject({
        crs: modisProjection,
        scale: scale_dem
      });
      var minDEMvalue = reprojectedDEM.reduceRegion({
        reducer: ee.Reducer.min(),
        geometry: aoi,
        scale: scale_dem,
        tileScale: tileScaleValue,
        maxPixels: 1e13
      }).get(reprojectedDEM.bandNames().get(0));  // Get the actual max value
      // Build dictionary: each key gets the same value
      minDEM = ee.Dictionary.fromLists(aspectKeys, ee.List.repeat(minDEMvalue, aspectKeys.length));

      var maxDEMvalue = reprojectedDEM.reduceRegion({
        reducer: ee.Reducer.max(),
        geometry: aoi,
        scale: scale_dem,
        tileScale: tileScaleValue,
        maxPixels: 1e13
      }).get(reprojectedDEM.bandNames().get(0));  // Get the actual max value
      // Build dictionary: each key gets the same value
      maxDEM = ee.Dictionary.fromLists(aspectKeys, ee.List.repeat(maxDEMvalue, aspectKeys.length));

      // Compute aspect from the reprojected DEM to ensure consistent projection
      var aspect = ee.Terrain.aspect(dem);
      
      // Classify aspect directions
      var north = aspect.gt(315).or(aspect.lte(45)).rename('North');
      var east = aspect.gt(45).and(aspect.lte(135)).rename('East');
      var south = aspect.gt(135).and(aspect.lte(225)).rename('South');
      var west = aspect.gt(225).and(aspect.lte(315)).rename('West');
      
      // Combine into one image for convenience (with correct projection)
      aspects = north.addBands(east).addBands(south).addBands(west).reduceResolution({
        reducer: ee.Reducer.mode(),
        // bestEffort: true,
          maxPixels: 1024,
      })
        .reproject({
          crs: modisProjection,
          scale: scale
        });
        
      aspect_coded = ee.Image(5).setDefaultProjection(aspects.select(0).projection())
        .where(aspects.select('North').eq(1), 2)
        .where(aspects.select('East').eq(1), 1)
        .where(aspects.select('South').eq(1), 3)
        .where(aspects.select('West').eq(1), 4)
        .rename('mixed');
 
      aspects=aspects.addBands(aspect_coded.eq(5));
        
      //count number of grid cells
      n_grid=reprojectedDEM.reduceRegion({
          reducer: 'count',
          geometry: aoi,
          scale: scale_dem,
          tileScale: tileScaleValue,
          maxPixels: 1e13,
        }).values().get(0);
        
        
    ////Alternatively: assign every grid cell an anspect:
      // var aspect_coded = ee.Image(0).setDefaultProjection(dem.projection())
      //   .where(north, 1)
      //   .where(east, 2)
      //   .where(south, 3)
      //   .where(west, 4)
      //   .rename('aspect_code')
      //   .reduceResolution({
      //       reducer: ee.Reducer.mode(),
      //       // bestEffort: true,
      //         maxPixels: 1024,
      //     })
      //   .reproject({
      //     crs: modisProjection,
      //     scale: scale
      //   });
      //       // Create binary masks for each aspect class
      // north = aspect_coded.eq(1).rename('North');
      // east  = aspect_coded.eq(2).rename('East');
      // south = aspect_coded.eq(3).rename('South');
      // west  = aspect_coded.eq(4).rename('West');
      
      // // Combine into one multi-band image
      // aspects = north.addBands(east).addBands(south).addBands(west);
};
  
//function to calculate the snowline altitude
var modis_SLA=function(image, aoi,glaciers){
    // Use canny edge to detect edges in the MODIS image
    // var image = selected_ic.sort('system:time_start', false).first();

    // Clip image edges
    var mask = image.clip(aoi).mask().gt(0).focal_min(ee.Number(scale).multiply(2), 'circle', 'meters');
    
    
    // Detect sharp changes (use snow fraction > 50% as binary threshold)
    var binarySnow = image.gt(sc_th);
    
    //apply sieving to remove noise
    var ppha=ee.Number(10);
    
    var img0=binarySnow.rename('classification').int().reproject({
          crs: modisProjection,
          scale: scale
        });
    var targetPixels = img0.mask(img0).unmask(0).rename('sieve').connectedPixelCount(ppha.add(1), false);
    var smallClusters = targetPixels.reproject({
          crs: modisProjection,
          scale: scale
        });
    var img_sieve= img0.addBands(smallClusters);
    var img_pos= img_sieve.select(['classification']).where(img_sieve.select(['sieve']).lte(ppha),0);
    
    //fill zero values within unmasked areas
    var img0_inv=img_pos.not().mask(img_pos.not()).unmask(0);
    var targetPixels2 = img0_inv.mask(img0_inv).rename('sieve').connectedPixelCount(ppha.add(1), false);
    var smallClusters2 = targetPixels2.reproject({
          crs: modisProjection,
          scale: scale
        });
    var img_sieve2= img0_inv.addBands(smallClusters2);
    binarySnow = img_pos.select(['classification']).where(img_sieve2.select(['sieve']).lte(ppha),1).rename('value')
      .mask(img0.gte(0));
    
    binarySnow=binarySnow.reproject({
      crs: modisProjection,
      scale: scale_dem
    });
    var edge = ee.Algorithms.CannyEdgeDetector(binarySnow, cannyThreshold, cannySigma);
    edge = edge.multiply(mask);

    // Apply edge buffer
    var edgeBuffer = edge.reproject({
      crs: modisProjection,
      scale: scale_dem
    });//.focal_max(ee.Number(scale_dem).multiply(1), 'square', 'meters');
    
    edgeBuffer=edgeBuffer.updateMask(mask.eq(1));
    // print('edgeBuffer', edgeBuffer);

    // Generate random points for stratified sampling (100 points per class should be sufficient)
    var binarySnow_mask=binarySnow.add(1).clip(aoi).mask().gt(0).focal_min(ee.Number(scale).multiply(2), 'circle', 'meters');
    stratifiedSamples = binarySnow.updateMask(binarySnow_mask.gt(0)).stratifiedSample({
      numPoints: 1,
      classBand: 'value',
      region: aoi,
      scale: scale_dem,
      tileScale: tileScaleValue,
      seed: 123,
      geometries: false
    }).aggregate_array('value');
    var sampleMax=ee.Number(stratifiedSamples.reduce(ee.Reducer.max()));
    var sampleMin=ee.Number(stratifiedSamples.reduce(ee.Reducer.min()));
    
    var null_object = ee.Feature(ee.Dictionary.fromLists(ee.List(aspectKeys),[null,null,null,null,null]));
    //       // Calculate elevations at the snow line for each aspect
    samplePoints = aspect_coded.addBands(reprojectedDEM).updateMask(edgeBuffer.gt(0))
        .updateMask(aspect_coded.gte(0)).stratifiedSample({
      region:aoi,
      classBand:'mixed',
      numPoints: point2sample,
      tileScale: 16,
      scale: scale_dem,
      seed:123,
      geometries: true,
      dropNulls: true
    });
    // // Calculate median elevations at the snow line for each aspect
    rr2 = ee.Feature(ee.List.sequence(0,4).iterate(function(x,previous){
      return ee.Feature(previous).set(ee.List(aspectKeys).get(ee.Number(x)),
        samplePoints.filter(ee.Filter.eq('mixed',ee.Number(x).add(1))).aggregate_array('DSM').reduce(ee.Reducer.median()));
    },ee.Feature(null))).toDictionary();
    
    rr1 = ee.Feature(ee.List.sequence(0,4).iterate(function(x,previous){
      return ee.Feature(previous).set(ee.List(aspectKeys).get(ee.Number(x)),
        samplePoints.filter(ee.Filter.eq('mixed',ee.Number(x).add(1))).aggregate_array('DSM').reduce(ee.Reducer.percentile([10])));
    },ee.Feature(null))).toDictionary(); 
    rr2_count = ee.Feature(ee.List.sequence(0,4).iterate(function(x,previous){
      return ee.Feature(previous).set(ee.List(aspectKeys).get(ee.Number(x)),
        samplePoints.filter(ee.Filter.eq('mixed',ee.Number(x).add(1))).aggregate_array('DSM').reduce(ee.Reducer.count()));
    },ee.Feature(null))).toDictionary();

    // Calculate average fractional snow cover (based on binary image, not based on original data)
    fsc = binarySnow
      .reduceRegion({
        reducer: 'mean',
        geometry: aoi,
        scale: scale,
        tileScale: tileScaleValue,
        maxPixels: 1e13,
      }).values().get(0);  
        
    // Get the available (non-null) values from the dictionary
    var validValues = rr2.values().removeAll([null]);
    
    // Calculate mean of valid values (if any exist)
    var meanValue = ee.Algorithms.If(
      validValues.size().gt(0),
      validValues.reduce(ee.Reducer.mean()),
      null
    );

  // Choose whether to use minDEM or maxDEM based on which is closer to the mean
    var replacementValue = ee.Number(ee.Algorithms.If(ee.Algorithms.IsEqual(fsc, null),null,
      ee.Algorithms.If(
      ee.Number(fsc).gte(0.9),
      minDEM.values().reduce(ee.Reducer.min()),
       ee.Number(ee.Algorithms.If(
      ee.Number(fsc).lte(0.1),
      maxDEM.values().reduce(ee.Reducer.max()),
      //what do we do if certain aspects are simply not present?--> Take average of other aspects
      //Attention, there are cases where we cannot take the mean, because of no snowline in available pixels
      //in that case, with the current script, we will have data gaps
      rr2.values().reduce(ee.Reducer.mean()))))
    ));    
 
    rr2=ee.Feature(null,ee.Algorithms.If(
      ee.Algorithms.IsEqual(sampleMin, null),
      rr2,  // if sampleMin is null, return original rr2
      ee.Algorithms.If(sampleMin.eq(1),minDEM,ee.Algorithms.If(sampleMax.eq(0),maxDEM,rr2)))); 
    // Replace nulls
    rr2 = ee.Feature(ee.List(aspectKeys).iterate(function(item,previous) {
      item=ee.String(item);
      var count=rr2_count.get(item);
      var frac=ee.Number(count).divide(n_grid);
      return ee.Algorithms.If(ee.Algorithms.IsEqual(ee.Feature(previous).get(item), null), ee.Feature(previous).set(item,replacementValue), 
        ee.Algorithms.If(ee.Number(count).lt(10).and(frac.lt(0.01)), ee.Feature(previous).set(item,replacementValue),ee.Feature(previous)));
    },rr2));
    
    rr2=ee.Feature(ee.Algorithms.If(rr2.propertyNames().size().eq(0),ee.Feature(null,null_object),rr2));
    
    sla_image=reprojectedDEM.updateMask(edgeBuffer.gt(0));
    
    //export also Glacier SCF, Glacier SCF below snowline (accounting for aspect), Glacier area below snowline (accounting for aspect)
    if (glaciers!==null){
      var glims_scf_image=glaciers.reduceToImage(['area'],ee.Reducer.first()).gt(0).multiply(binarySnow);
      glims_scf_below_sl_img=ee.Image(ee.List(aspectKeys).iterate(function(item,previous) {
        item=ee.String(item);
        // var sla=ee.Number(rr2.get(item));
        var img=ee.Image(ee.Algorithms.If(ee.Algorithms.IsEqual(rr2.get(item),null),previous,ee.Image(previous).where(dem.gt(ee.Number(rr2.get(item))).and(aspects.select(item).eq(1)),-1)));
        return img.updateMask(img.neq(-1));
      },glims_scf_image));
      var glims_area_below_SL_img=glims_scf_below_sl_img.gte(0).multiply(ee.Image.pixelArea()).multiply(1e-6);
      
      //Glacier SCF
      glims_fsc = glims_scf_image
        .reduceRegion({
          reducer: 'mean',
          geometry: aoi,
          scale: 30,
          tileScale: tileScaleValue,
          maxPixels: 1e13,
        }).values().get(0);  
      //Glacier SCF, below SL
      glims_fsc_below_sl = glims_scf_below_sl_img
        .reduceRegion({
          reducer: 'mean',
          geometry: aoi,
          scale: 30,
          tileScale: tileScaleValue,
          maxPixels: 1e13,
        }).values().get(0); 
        
    glims_fsc_below_sl=ee.Number(ee.Algorithms.If(ee.Algorithms.IsEqual(rr2.get('North'),null),null,glims_fsc_below_sl));
        
      //Glacier SCF, below SL
      glims_area_below_sl = glims_area_below_SL_img
        .reduceRegion({
          reducer: 'sum',
          geometry: aoi,
          scale: 30,
          tileScale: tileScaleValue,
          maxPixels: 1e13,
        }).values().get(0);  
        
    glims_area_below_sl=ee.Number(ee.Algorithms.If(ee.Algorithms.IsEqual(rr2.get('North'),null),null,glims_area_below_sl));
    }
};

//Layer selection
var click2download=function(){};
var layer; var map2download; var layer_active;
var AoiMean; var enddate_client; var layer_path;var joinProperty;var AoiMean_fromAsset; 

//var aoi_select_region= ui.Select(); 
var nameprefix; var selected_ic; var sla_ic; var checkbox2download=ui.Checkbox(); //var visArgs;var downloadselectionmode = false;

var items = [ 
  {label: 'Decadal snow cover fraction', value: 0},
  {label: 'Decadal snow line altitude', value: 5},
  {label: 'Monthly snow water equivalents (ERA5-Land)', value: 1},
  {label: 'Monthly snow water equivalents (TerraClimate)', value: 4},  
  {label: 'Annual first day of no snow', value: 2},
  {label:  'Annual first day of no snow 2001-'+ thisyear + ' TREND', value: 3}
];


// helper to lowercase the first character of a string
function lowercaseFirst(str) {
  return str.charAt(0).toLowerCase() + str.slice(1);
}

var getSelectedLayer = function() {
  var match = items.filter(function(item) {
    return item.value === layer;
  })[0];
  return match ? lowercaseFirst(match.label) : null;
};

var layer_select = ui.Select({style:{width: '200px',height: '29px',margin: '2px 1px 1px 10px'},
    items: items,
    onChange: function(key){
      Map.onClick(null);uiMap.unlisten(mapclick2);
      aoi_select_subbasin.setValue(null,false);
      layer=key;
      uiMap.unlisten(mapclick);uiMap.style().set('cursor', 'hand');
      uiMap.remove(dateslider);
      legend.remove(panel_SL_legend);
      if (layer==5){
        legend.add(panel_SL_legend);
      }      
      if (layer_active===0){
        legend.add(legend_subpanel);
        uiMap.remove(sliderPanel);
        uiMap.add(sliderPanel);
        uiMap.layers().get(0).setShown(true);
      }
      layer_active=1;slider.setValue(1);
      panel_layer_details.clear();
      var link_source = ui.Label({ value : layers_source[key], style : { fontSize: '12px',margin: '1px 1px 1px 10px'},
        targetUrl :layers_source_URL[key]});
      
      if (key != 5){
        download_csv_label = ui.Label({ value : 'Link', style : {fontSize: '12px',margin: '1px 1px 1px 10px'},
          targetUrl : ee.FeatureCollection(layers_download[key]).sort('year').sort('Year-Month-Day').getDownloadURL({format: 'csv', filename :layers_download[key].split('snow_CentralAsia/')[1]})} );
      } else if (basin_selected !== null) {
        get_layer_path(key,0);
      } else {
        download_csv_label=ui.Label({ value : 'Please select a basin', style : {fontSize: '12px',margin: '1px 1px 1px 10px'}});
      }
      panel_layer_details.add(ui.Label('Layer Details', {fontWeight: '450', fontSize: '12px',height: '20px',color: 'red',margin: '10px 1px 1px 10px'}));
      panel_layer_details.add(ui.Panel({widgets: [ui.Label('Source: ', {fontSize: '12px',color: 'red',margin: '1px 1px 1px 10px'}),
        link_source], layout: ui.Panel.Layout.flow('horizontal')}));
      panel_layer_details.add(ui.Panel({widgets: [ui.Label('Spatial Resolution: ', {fontSize: '12px',color: 'red',margin: '1px 1px 1px 10px'}),
        ui.Label(layers_resolution[key], {fontSize: '12px',margin: '1px 1px 1px 10px'})], layout: ui.Panel.Layout.flow('horizontal')}));    
      panel_layer_details.add(ui.Panel({widgets: [ui.Label('Download Time-Series: ', {fontSize: '12px',color: 'red',margin: '1px 1px 1px 10px'}),
       download_csv_label], layout: ui.Panel.Layout.flow('horizontal')}));
      dateslider.setEnd(endDate);
      dateslider.setValue(endDate);
      if (key === 0 || key ==5) {
        nameprefix = 'DecadalSCF';
        //add dateslider, set the last date to the last available image of the collection
        print('endDate',endDate.format('YYYY-MM-dd HH:mm'));
        // endDate=ee.Date.fromYMD(endDate.get('year'),endDate.get('month'),1);
        // dateslider.setValue(ee.Date.fromYMD(endDate.get('year'),endDate.get('month'),1));

        print('dateslider end',ee.Date(ee.List(dateslider.getValue()).get(0)).format('YYYY-MM-dd'));
        enddate_client=new Date(dateslider.getValue()[0]).toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        });
        selected_date=enddate_client;
        uiMap.add(dateslider);
        //Decadal composites
        get_sla_ic();
        selected_ic=sla_ic;
        map2download=selected_ic.sort('system:time_start',false).first();
        print('selected_ic',selected_ic);
        //ee.Date.fromYMD(startYear, 1, 1)

        //visArgs=visArgs_FSC;
        //Legend parameters
        viz.palette=['blue','white'];
//        viz.palette=['white','blue'];
        viz.max=100;
        viz.min=0;
        gradient = lon.multiply((viz.max-viz.min)/100.0).add(viz.min);
        legendImage = gradient.visualize(viz);
        legend_max.setValue(viz.max + '% Snow Cover');
        legend_min.setValue(viz.min);
        thumbnail.setImage(legendImage);
        // Display the MODIS dd layer
        uiMap.layers().set(0, ui.Map.Layer(selected_ic.sort('system:time_start', false).first(), visArgs_FSC, 'FSC 12_' + thisyear));
        selected_fsc=selected_ic.sort('system:time_start', false).first();
        if (layer ==5) {
          if (basin_selected !== null){
            modisProjection = selected_fsc.projection();
            dem4SLA(aoi);
            modis_SLA(selected_fsc,aoi,glims.filterBounds(aoi));
            modis_SLAdisplay(sla_image);
          }
        }
      
        //era5_swe
      } else if (key == 1 || key == 4){
        nameprefix = 'MonthlySWE';
        var swe=era5_swe;
        if (key == 4){
          swe=terraClimate;
        }
        //add dateslider, set the last date to the last available image of the collection
        selected_ic=ee.ImageCollection(swe.map(function(img){
          var year=ee.Number(ee.Date(ee.Image(img).get('system:time_start')).get('year'));
          var month=ee.Number(ee.Date(ee.Image(img).get('system:time_start')).get('month'));
          // var day=ee.Number(ee.Date(ee.Image(img).get('system:time_start')).get('day'));
          return ee.Image(img)/*.multiply(1000)*/.max(ee.Image(0)).rename('value')
            .set('system:time_start',ee.Date.fromYMD(year,month,2))
            .set('Year-Month-Day',ee.Date(ee.Image(img).get('system:time_start')).format('YYYY-MM-dd'));
            //.set('year', year.add(month.divide(ee.Number(12)).subtract(ee.Number(1/12))));
        }));
        print('selected_ic',selected_ic);

        var endDate2=ee.Date(ee.Image(selected_ic.filter(ee.Filter.calendarRange(thisyear - 1,thisyear,'year')).sort('system:time_start',false).first()).get('system:time_start'));
        print('endDate',endDate2.format('YYYY-MM-dd HH:mm'));
        dateslider.setEnd(endDate2);
        
        uiMap.add(dateslider);
        map2download=selected_ic.sort('system:time_start',false).first();
        //uiMap.layers().set(0,ui.Map.Layer(selected_ic.sort('system:time_start',false).first(), visArgs_SWE, 'SWE'));
        //Legend parameters
        viz.palette=['blue','white'];
        //viz.palette=['white','blue'];
        viz.max=100;
        viz.min=0;
        gradient = lon.multiply((viz.max-viz.min)/100.0).add(viz.min);
        legendImage = gradient.visualize(viz);
        legend_max.setValue(viz.max + ' mm SWE');
        legend_min.setValue(viz.min);
        thumbnail.setImage(legendImage);
        dateslider.setValue(endDate2);
      } else if (key === 2){
        nameprefix = 'FirstDayOfNoSnow';
        uiMap.layers().set(0,ui.Map.Layer(d,null,'River Basins'));//placeholder
        selected_ic=annualCol.select('value');
        //Legend parameters
        viz.palette=palette1;
        viz.max=220;
        viz.min=0;
        gradient = lon.multiply((viz.max-viz.min)/100.0).add(viz.min);
        legendImage = gradient.visualize(viz);
        legend_max.setValue('DOY ' + viz.max);
        legend_min.setValue(viz.min);
        thumbnail.setImage(legendImage);
        legend.remove(legend_subpanel);
        layer_active=0; //layer gets added to map only after year selection
      } else if (key === 3){
        nameprefix = 'FirstDayOfNoSnow';
        map2download = slope;
        uiMap.layers().set(0,ui.Map.Layer(slope, visArgs_trend, '2001-'+thisyear + ' first day no snow slope'));
        selected_ic=annualCol.select('value');
        //Legend parameters
        //viz.palette=palette2;
        viz.max=1;
        viz.min=-1;
        /*gradient = lon.multiply((viz.max-viz.min)/100.0).add(viz.min);
        legendImage = gradient.visualize(viz);*/ 
        legend_max.setValue(viz.max + ' (Slope)');
        legend_min.setValue(viz.min);
        thumbnail.setImage(legendImage_trend);
      }
      var zmax=4;
      if (basin_selected !== null){
        zmax=3;
      }
      if (key != 5){
        task_click1(selected_ic);
        zmax=3;
      }
      task_click2();
      //clean up: remove widgets and layers
      var zIndex = selectionPanel.widgets().length();
      for (var i=zIndex-1; i>3; i--) {
        selectionPanel.remove(selectionPanel.widgets().get(i));
      }
      chartpanel1.clear();chartpanel2.clear();chartpanel3.clear();
      zIndex = uiMap.layers().length();
      for (i=zIndex-1; i>zmax; i--) {
        uiMap.remove(uiMap.layers().get(i));
      }
      checkbox2download.setValue(false);
      checkbox3download.setValue(false);
      uiMap.centerObject(RiverBasinsExtent);
    //EXPORT THE DATA FROM ALL BASINS AS A TABLE:
    if (layer<=1 || layer >= 4){//Decadal layers
      joinProperty='Year-Month-Day';
    } else {//ANNUAL layers
      joinProperty='year';
    }
    // var features_with_time =selected_ic.map(function(img){return ee.Feature(null).copyProperties(ee.Image(img),[joinProperty])});
    // print('features_with_time',features_with_time);
    // var enddate=ee.String(ee.Feature(features_with_time.sort(joinProperty,false).first()).get(joinProperty));
    // enddate.evaluate(function(result) {
    //   enddate_client=result;
    //   });
    if (aoi_selected == 1){
      aoi_select_subbasin.setValue(basin_selected);
    }
  }
});

var get_sla_ic=function(){
  sla_ic=ee.ImageCollection(time_intervals_all.slice(0,-1).cat(time_intervals_all2).map(function(list){
    var start=ee.Date(ee.List(list).get(0));
    var end=ee.Date(ee.List(list).get(1));
    var year=ee.Number(start.get('year'));
    var month=ee.Number(start.get('month'));
    var day=ee.Number(start.get('day'));
    var img2return=mscf.filterDate(start,end).mean().rename('value');
    img2return=img2return.focal_mean({radius: 2, kernelType :'circle',units: 'pixels',iterations: 1}).blend(img2return);
    return img2return
      //.set('system:time_start',start)
      .set('system:time_start',ee.Date.fromYMD(year,month,day))
      .set('Year-Month-Day',start.format('YYYY-MM-dd'));
      //.set('year', ee.Number(start.get('year')).add(month.divide(ee.Number(12)).subtract(ee.Number(1/12))));
  }));
  // Tag images with band count
  var tagged = sla_ic.map(function(img) {
    return img.set('band_count', img.bandNames().size());
  });
  // Filter images with at least one band
  sla_ic = tagged.filter(ee.Filter.gt('band_count', 0));
};
//define titles and labels for charts, for each option above
var charttitle=['Regional mean decadal fractional snow cover','Regional mean decadal snow water equivalents',
  'Regional mean first day of year with no snow cover','Regional mean first day of year with no snow cover','Regional mean decadal snow water equivalents',
  'Regional mean snow line altidue by aspect'];
var charttitle2=['Mean decadal fractional snow cover at Point of Interest','Mean decadal snow water equivalents at Point of Interest',
  'First day of year with no snow cover at Point of Interest','First day of year with no snow cover at Point of Interest','Mean decadal snow water equivalents at Point of Interest',
  'Mean decadal snow line altitude by aspect at Point of Interest'];
var charttitle3=['Regional mean decadal fractional snow cover','Regional mean decadal snow water equivalents',
  'Regional mean first day of year with no snow cover','Regional mean first day of year with no snow cover','Regional mean decadal snow water equivalents',
  'Regional mean snow line altidue (basin average)'];
var axistitle=['fSC (%)','mm s.w.e.','Day-of-year','Day-of-year','mm s.w.e.','m asl.'];
var variables=['system:time_start','system:time_start','year','year','system:time_start','system:time_start'];
var hAxisformat=['MMM d, y','MMM d, y','####','####','MMM d, y','MMM d, y'];
var hAxisformat2=['MMM d','MMM d, y','####','####','MMM d, y','MMM d'];
// var hAxisformat = ['MMM', 'MMM', '####', '####', 'MMM', 'MMM'];

var hAxistitle=['Date','Date','Year','Year','Date','Date'];

//Checkbox to activate selection of tiles for download
//var message=ui.Label({ value :'Click on the selected River Basin to select a Tile', style : {color:'red'}  });
var message=ui.Label({ value :'Please wait...', style : {color:'red'}  });
var panel2download=ui.Panel({widgets: [],layout: ui.Panel.Layout.flow('vertical')});
var label4download=ui.Label('Generate Download Links', {fontWeight: '450', fontSize: '16px',height: '29px',margin: '15px 1px 1px 10px'});
panel2download.add(label4download);
var panel_checkbox3download=ui.Panel({widgets: [],layout: ui.Panel.Layout.flow('vertical')});
panel2download.add(panel_checkbox3download);
var panel_checkbox2download=ui.Panel({widgets: [],layout: ui.Panel.Layout.flow('vertical')});
panel2download.add(panel_checkbox2download);

var checkbox3download=ui.Checkbox({label: 'Basin Time-series',value: false, 
    onChange: function(checked) {
    if(checked===true){
      if (layer <= 1 || layer >=5){
        csvname= nameprefixes[layer] + '_' + aoiname;
      }
      var download_csv_label = ui.Label({ value : csvname, style : { shown:true,margin: '5px 1px 1px 26px'},
          targetUrl : AoiMean.getDownloadURL({format: 'csv', filename :csvname})} );
        panel_checkbox3download.add(download_csv_label);
    } else {
      panel_checkbox3download.remove(panel_checkbox3download.widgets().get(1));
    }
    }});
panel_checkbox3download.add(checkbox3download);
checkbox2download=ui.Checkbox({label: 'Basin Maps',value: false, 
    //style: {fontWeight: '450', fontSize: '16px',height: '29px',margin: '15px 1px 1px 10px'},
    onChange: function(checked) {
    if(checked===true){
      panel_checkbox2download.add(message);
      downloaddata(); //uiMap.unlisten(mapclick);
    } else {
      panel_checkbox2download.clear();
      panel_checkbox2download.add(checkbox2download);
    }
    }});
panel_checkbox2download.add(checkbox2download);

//Download Option: click on the map to select tiles for download
var mapname; var csvname;

var downloaddata=function(){
  var gridsize=500;
  var tilesize=ee.Number(10000).multiply(ee.Number(gridsize)).divide(111000).multiply(0.10);///Total request size must be less than or equal to 33554432 bytes
  var stateGrid = ee.FeatureCollection(functions4cropmapper.coverByGrid(aoi,tilesize, tilesize));//0.89° ~=100'000 m ~= 10000x10000 pixels (10m)
  // print('stateGrid',stateGrid);
  var isregion = stateGrid/*.filterBounds(pointd)*/.size();
  isregion.evaluate(function(result) {
    panel_checkbox2download.remove(message);
    var mapname0 = mapname;
    for (var i=0; i<result; i++) {
      // print('i',i);
      var downloadregion=ee.Feature(stateGrid.toList(99).get(i));
      var region = batch.getRegion(downloadregion.geometry());
      if (layer <= 1 || layer == 4){
        mapname= nameprefix + '_' + aoiname + '_' + mm_yyyy;
        if (result>1){
          mapname= nameprefix + '_' + aoiname + '_' + mm_yyyy + '_tile' + i;
        }
      } else if (result>1){
        mapname = mapname0  + '_tile' + i;
      }
      // print('mapname',mapname);
      var download_tif_label = ui.Label({ value : mapname, style : { shown:true,margin: '5px 1px 1px 26px'},
        targetUrl : map2download.clip(aoi).toInt16().getDownloadURL({scale: 500, region: region, name :mapname})} );
      panel_checkbox2download.add(download_tif_label);
    } //else {print('check2')}
  });
};

//Year selection
var firstDayNoSnowYear;
var years_select = ui.Select({style:{width: '200px',height: '29px',margin: '2px 1px 1px 10px'},
    items: [ 
     ],
    onChange: function(key){
      var year = key;
      // Subset the year of interest.
      firstDayNoSnowYear = annualCol.filter(ee.Filter.eq('year', key)).first();//.clipToCollection(RiverBasins);
      map2download = ee.Image(firstDayNoSnowYear).select('value');
      // Map it.
      uiMap.layers().set(0,ui.Map.Layer(firstDayNoSnowYear, visArgs_single, 'First day of no snow, Year '+year));
      //add legend
      if (layer_active===0){
        // uiMap.add(legend);
        legend.add(legend_subpanel);
        
        uiMap.remove(sliderPanel);
        uiMap.add(sliderPanel);
      }
      layer_active=1;
      panel_checkbox2download.style().set('shown', true);
      checkbox2download.setValue(false,false);
      mapname= nameprefix + '_' + aoiname + '_Year' + year;
      //chartpanel2.clear();
      var zIndex = uiMap.layers().length();
      for (var i=zIndex-1; i>3; i--) {
        uiMap.remove(uiMap.layers().get(i));
      }
    }
});

//AoI selection
var region_list=ee.Dictionary.fromLists(region_names.distinct(), region_names.distinct()).keys().getInfo();
// print('region_list',region_list);
var region; var aoiname; var aoi; var regionname='...'; var new_catchment_names;
var aoi_select_region = ui.Select({style:{fontWeight: '450', fontSize: '16px',width: '200px',height: '29px',margin: '15px 1px 1px 10px'}, 
    items: region_list,
    onChange: function(key){
      chartpanel2.clear();iteration_id_tmp2=0;
      regionname=key;
      aoi_select_subbasin.setValue(null,false);
      aoi_selected=0; basin_selected=null;glacier_selected=0;
      aoi_select_subbasin.setPlaceholder('Select a River Basin...');
      if (key == '...'){
        aoi_select_subbasin.items().reset(subbasin_list);
        aoi_select_region.setPlaceholder('Select a Region...');
        uiMap.unlisten(mapclick);uiMap.style().set('cursor', 'hand');
        //uiMap.remove(dateslider);
        if (layer != 5){task_click1(selected_ic)}
        // task_click2();
        //clean up: remove widgets and layers
        var zIndex = selectionPanel.widgets().length();
        for (var i=zIndex-1; i>3; i--) {
          selectionPanel.remove(selectionPanel.widgets().get(i));
        }
        chartpanel1.clear();chartpanel2.clear();chartpanel3.clear();
        zIndex = uiMap.layers().length();
        for (i=zIndex-1; i>3; i--) {
          uiMap.remove(uiMap.layers().get(i));
        }
        //checkbox2download.setValue(false);
        aoi_select_region.setValue(null,false);
        uiMap.centerObject(RiverBasinsExtent);        
      } else {
        aoi=ee.Feature(Regions_2023.filter(ee.Filter.eq('REGION', key)).first()).geometry();
        aoiname=key.replace(" ","",'g');
        var layerGeometry = ui.Map.Layer( ee.Image().paint(Regions_2023.filter(ee.Filter.eq('REGION', key)),0, 2), {palette: 'yellow'},'Area of Interest');
        uiMap.layers().set(3,  layerGeometry );        
        // basin_selection(key);
        // zoom to selected AoI
        uiMap.centerObject(aoi);
        new_catchment_names=RiverBasins_2023.filter(ee.Filter.eq('REGION', key)).aggregate_array('NAME');
        var tmp_catchment_names = ee.List(['...']).cat(new_catchment_names);
        var  new_subbasin_list=ee.Dictionary.fromLists(tmp_catchment_names.distinct(), tmp_catchment_names.distinct()).keys();//.getInfo();
        aoi_select_subbasin.setPlaceholder('Please wait...');
        aoi_select_subbasin.setDisabled(true);
        new_subbasin_list.evaluate(function(result){
          aoi_select_subbasin.items().reset(result);
          aoi_select_subbasin.setDisabled(false);
          aoi_select_subbasin.setPlaceholder('Select a River Basin...');
        });
        
      }
    }
}).setPlaceholder('Select a Region...');

var subbasin_list=ee.Dictionary.fromLists(catchment_names.distinct(), catchment_names.distinct()).keys().getInfo();
var aoi_selected=0; var basin_selected=null; var download_csv_label;

var get_layer_path = function(key,v){
        var export_layer_name='decadal_SLA';
        var catchment_name=basin_selected;
        layer_path=layers_download[key] + '/'+ export_layer_name + '_'+ catchment_name.replace('.', '', 'g');// + '_until'+ last_export_date.split('.')[0];
        // print('layer_path',layer_path);
        download_csv_label = ui.Label({ value : 'Link', style : {fontSize: '12px',margin: '1px 1px 1px 10px'},
        targetUrl : //ee.FeatureCollection(layer_path).sort('year').sort('Year-Month-Day')
          ee.FeatureCollection(assetList_SLA.filter(ee.Filter.eq('NAME',catchment_name.replace('.', '', 'g')))).flatten().sort('Year-Month-Day').distinct(['Year-Month-Day'])
          .getDownloadURL({format: 'csv', filename :layer_path.split('/').reverse()[0]})});
        if (v==1){
          panel_layer_details.widgets().set(3,ui.Panel({widgets: [ui.Label('Download Time-Series: ', {fontSize: '12px',color: 'red',margin: '1px 1px 1px 10px'}),
          download_csv_label], layout: ui.Panel.Layout.flow('horizontal')}));
        }
};
  //MONTHLY LONG-TERM AVERAGE
var getmonthlyValues=function(dacadal_values,variable_name,thisyear_now){  
    // var annual_areas=ee.List.sequence(2001, 2024).map(function(year) {
      
    //   var monthly_values0=ee.List.sequence(1,12).map(function(month) { //4,10
    //     var collection_Values=dacadal_values.filter(ee.Filter.calendarRange(ee.Number(year),ee.Number(year), 'year'))
    //     .filter(ee.Filter.calendarRange(ee.Number(month),ee.Number(month), 'month'));
    
    //     var col_mean= ee.Feature(null,{'amonthly':collection_Values.reduceColumns(ee.Reducer.median(),[variable_name]).get('median'),'system:time_start': ee.Date.fromYMD(ee.Number(year), ee.Number(month), 15),'month':ee.Number(month)});    
    //     var col_empty=ee.Feature(null).set('system:time_start',ee.Date.fromYMD(ee.Number(year), ee.Number(month), 1)).set('month',ee.Number(month));    
    //     return ee.Feature(ee.Algorithms.If(collection_Values.size().eq(0),col_empty,col_mean));
    //   });
    //   return monthly_values0;
    // });
    var monthly_value=ee.List.sequence(1,12).map(function(month) {
      // var col=ee.FeatureCollection(annual_areas.flatten()).filter(ee.Filter.eq('month',ee.Number(month)));
      var col=dacadal_values.filter(ee.Filter.calendarRange(ee.Number(month),ee.Number(month), 'month'));
      var col_median= ee.Feature(null,{'amonthly':col.reduceColumns(ee.Reducer.mean(),[variable_name]).get('mean'),'system:time_start': ee.Date.fromYMD(thisyear_now, ee.Number(month), 15),'month':ee.Number(month)});    
      return col_median;
    });
    return monthly_value;
};

var aoi_select_subbasin = ui.Select({style:{fontWeight: '450', fontSize: '16px',width: '200px',height: '29px',margin: '15px 1px 1px 10px'}, 
    items: subbasin_list,
    onChange: function(key){
      chartpanel2.clear();iteration_id_tmp2=0;
      if (key == '...'){
        if(aoi_selected==1){
          aoi_select_region.setValue(null,false);
        }
        aoi_select_region.setValue(regionname);
        aoi_selected=0; basin_selected=null;glacier_selected=0;
        whitespacepanel.style().set('shown', true);
        panel2download.remove(panel4notes);
        chartpanel.remove(panel4notes);
        chartpanel.add(panel4notes);
        chartpanel1.clear();chartpanel2.clear();chartpanel3.clear();
        var zIndex = uiMap.layers().length();
        for (var i=zIndex-1; i>3; i--) {
          uiMap.remove(uiMap.layers().get(i));
        }
        uiMap.centerObject(RiverBasinsExtent);           
      } else {
        whitespacepanel.style().set('shown', false);
        chartpanel.remove(panel4notes);
        panel2download.remove(panel4notes);
        panel2download.add(panel4notes);
        aoi_selected=1; basin_selected=key;
        if (layer ==5){
          get_layer_path(layer,1);
        }
        aoi=ee.Feature(RiverBasins_2023.filter(ee.Filter.eq('NAME', key)).first()).geometry();
        aoiname=key.replace(" ","",'g');
        var layerGeometry = ui.Map.Layer( ee.Image().paint(RiverBasins_2023.filter(ee.Filter.eq('NAME', key)),0, 2), {palette: 'yellow'},'Area of Interest');
        uiMap.layers().set(3,  layerGeometry );      
        basin_selection(key);
      }
    }
}).setPlaceholder('Select a River Basin...');

var basin_selection = function(key){
      var chart;
      // zoom to selected AoI
      uiMap.centerObject(aoi);
      //calculate annual mean DOY of AOI.
      if (layer<=1 || layer == 4 ){//Decadal layers
        AoiMean = ee.FeatureCollection(get_AoiMean_sample(aoi,selected_ic,ee.Reducer.mean(),tileScaleValue)).map(function(ft){
              var time=ee.Date.parse('YYYY-MM-dd',ee.Feature(ft).get(joinProperty));
              return ee.Feature(ft).set('system:time_start', time.millis());
            });
        chart=get_chart(AoiMean,'value');
      } else if (layer==5){//SLA
        if (basin_selected !== null){//thisyear==year_of_last_extraction && 
          // AoiMean_fromAsset=ee.FeatureCollection(ee.FeatureCollection(layer_path).sort('year')
          AoiMean_fromAsset=ee.FeatureCollection(ee.FeatureCollection(assetList_SLA.filter(ee.Filter.eq('NAME',basin_selected))).flatten().sort('Year-Month-Day').distinct(['Year-Month-Day'])
            .select([joinProperty,'SLA_East','SLA_North','SLA_South','SLA_West'],[joinProperty,'East','North','South','West'])
            .map(function(ft){
              var time=ee.Date.parse('YYYY-MM-dd',ee.Feature(ft).get(joinProperty));
              return ee.Feature(ft).set('system:time_start', time.millis())
                .set('value',ee.Feature(ft).select(aspectKeys.slice(0,-1)).toDictionary().values().reduce(ee.Reducer.mean()));
            }));
          
          var last_export_date=ee.Date(AoiMean_fromAsset.sort('Year-Month-Day',false).first().get('Year-Month-Day'));
          var AoiMean_sinceLastExtracted = ee.FeatureCollection(selected_ic.filterDate(last_export_date.advance(1,'day'),index_date).map(function(img){
              modisProjection = img.projection();
              dem4SLA(aoi);
              modis_SLA(img,aoi,glims.filterBounds(aoi));
              return rr2.set('Year-Month-Day', ee.Date(img.get('system:time_start')).format('YYYY-MM-dd')).set('system:time_start', ee.Date(img.get('system:time_start')).millis());
          }));
          //calculate basin average value
          AoiMean_sinceLastExtracted=AoiMean_sinceLastExtracted.map(function(ft){
              return ee.Feature(ft).set('value',ee.Feature(ft).select(aspectKeys.slice(0,-1)).toDictionary().values().reduce(ee.Reducer.mean()));
            });
          print('AoiMean_sinceLastExtracted',AoiMean_sinceLastExtracted);          
          
          AoiMean=AoiMean_fromAsset.merge(AoiMean_sinceLastExtracted).sort('system:time_start');
        }
        
        chart=get_chart(AoiMean,['East','North','South','West']);
      } else {//ANNUAL layers
        AoiMean = ee.FeatureCollection(get_AoiMean(aoi,selected_ic,ee.Reducer.mean(),tileScaleValue));
        chart=get_chart(AoiMean,'value');
      }
        // print('AoiMean',AoiMean);
      // Get chart and print chart to console.
      chartpanel1.widgets().set(0,chart);
      
      if (layer===0 || layer==5 ){//Decadal layers
        // print('AoiMean_thisyear',AoiMean_thisyear);
        print('AoiMean',AoiMean);//Year-Month
        if (layer === 0){
          AoiMean_fromAsset=ee.FeatureCollection(layers_download[layer]).sort('Year-Month')
            .select(['Year-Month',key.replace('.', '', 'g')],[joinProperty,variable_names[layer]]).map(function(ft){
              var time=ee.Date.parse('YYYY-MM-dd',ee.String(ee.Feature(ft).get(joinProperty)).cat(ee.String('-15')));
              return ee.Feature(ft).set('system:time_start', time.millis());
            });
        }
        var long_term_values=getmonthlyValues(AoiMean_fromAsset.filter(ee.Filter.calendarRange(2001,2022,'year'))
          ,variable_names[layer],thisyear_now);
        long_term_values=ee.FeatureCollection(long_term_values.map(function(feat){
          var month=ee.Number(ee.Feature(feat).get('month'));
          return ee.Feature(feat).set('system:time_start', ee.Date.fromYMD(thisyear_now, month, 15));
        }));
        print('long_term_values',long_term_values);
        var AoiMean_previousyear=AoiMean.filter(ee.Filter.calendarRange(thisyear_now - 1,thisyear_now - 1,'year'))
          .select(['system:time_start',joinProperty,variable_names[layer]],['system:time_start',joinProperty,variable_names[layer]+(thisyear_now - 1)])
          .map(function(feat){
          var month=ee.Date(ee.Feature(feat).get('system:time_start')).get('month');
          var day=ee.Date(ee.Feature(feat).get('system:time_start')).get('day');
          return ee.Feature(feat).set('system:time_start', ee.Date.fromYMD(thisyear_now, month, day));
        });
        print('AoiMean_previousyear',AoiMean_previousyear);
        var AoiMean_thisyear=AoiMean.filterDate(ee.Date.fromYMD(thisyear_now, 1, 1),index_date);
        print('AoiMean_thisyear',AoiMean_thisyear)
        chart=get_lt_chart(long_term_values,AoiMean_thisyear,AoiMean_previousyear,variable_names[layer]);
        chartpanel3.widgets().set(0,chart);
      } else {
        chartpanel3.clear();
      }

      //clean up: remove widgets and layers
      var zIndex = selectionPanel.widgets().length();
      for (var i=zIndex-1; i>3; i--) {
        selectionPanel.remove(selectionPanel.widgets().get(i));
      }
      //chartpanel2.clear();
      zIndex = uiMap.layers().length();
      for (i=zIndex-1; i>3; i--) {
        uiMap.remove(uiMap.layers().get(i));
      }
      checkbox2download.setValue(false);
      checkbox3download.setValue(false);
      // panel2download.remove(panel_checkbox2download);//maps will be available for download after year selection
      panel_checkbox2download.style().set('shown', false);
      //Select a year for vizualization
      if (layer === 2){
        uiMap.layers().set(0,ui.Map.Layer(d,null,'River Basins'));//placeholder
        selectionPanel.widgets().set(4,ui.Label('Select a Year', {fontWeight: '450', fontSize: '16px',height: '29px',margin: '15px 1px 1px 10px'}));
        years_select.items().reset(year_list_client);
        years_select.setValue(null,false);
        selectionPanel.widgets().set(5,years_select);
        selectionPanel.widgets().set(6,panel2download);
        csvname= nameprefix + '_' + aoiname;
      } else if (layer == 3){
        selectionPanel.widgets().set(4,panel2download);
        mapname= nameprefix + '_' + aoiname + '_TREND';
        csvname=nameprefix + '_' + aoiname;
        panel_checkbox2download.style().set('shown', true);
      } else if (layer <= 1 || layer == 4){
        selectionPanel.widgets().set(4,panel2download);
        mapname= nameprefix + '_' + aoiname;
        csvname=mapname;
        panel_checkbox2download.style().set('shown', true);
      } else if (layer == 5){
        selectionPanel.widgets().set(4,panel2download);
        //display SLA
        modisProjection = selected_fsc.projection();
        dem4SLA(aoi);
        modis_SLA(selected_fsc,aoi,glims.filterBounds(aoi));
        modis_SLAdisplay(sla_image);
      }
      //download map
};

//Add UI elements to selection panel.
var panel_layers=ui.Panel({widgets: [],layout: ui.Panel.Layout.flow('horizontal')});
var panel_layer_selection=ui.Panel({widgets: [],layout: ui.Panel.Layout.flow('vertical')});
var panel_layer_details=ui.Panel({widgets: [],layout: ui.Panel.Layout.flow('vertical')});
panel_layer_selection.add(ui.Label('Select a Layer', {fontWeight: '450', fontSize: '16px',height: '29px',margin: '15px 1px 1px 10px'}));
panel_layer_selection.add(layer_select);
panel_layer_details.add(ui.Label('Layer Details', {fontWeight: '450', fontSize: '12px',height: '20px',color: 'red',margin: '10px 1px 1px 10px'}));
panel_layer_details.add(ui.Label('Source:', {fontSize: '12px',color: 'red',margin: '1px 1px 1px 10px'}));
panel_layer_details.add(ui.Label('Spatial Resolution:', {fontSize: '12px',color: 'red',margin: '1px 1px 1px 10px'}));
panel_layer_details.add(ui.Label('Download Time-Series:', {fontSize: '12px',color: 'red',margin: '1px 1px 1px 10px'}));
panel_layers.add(panel_layer_selection);
panel_layers.add(panel_layer_details);
selectionPanel.add(ui.Label('USER INPUTS', {fontWeight: '600', fontSize: '16px',height: '29px',margin: '15px 1px 1px 10px'}));
selectionPanel.add(panel_layers);
var panel_basin_selection=ui.Panel({widgets: [],layout: ui.Panel.Layout.flow('horizontal')});
var panel_rb_selection=ui.Panel({widgets: [],layout: ui.Panel.Layout.flow('vertical')});
var panel_sub_selection=ui.Panel({widgets: [],layout: ui.Panel.Layout.flow('vertical')});

panel_rb_selection.add(ui.Label('Select a Region', {fontWeight: '450', fontSize: '16px',height: '29px',margin: '15px 1px 1px 10px'}));
panel_sub_selection.add(ui.Label('Select a River Basin', {fontWeight: '450', fontSize: '16px',height: '29px',margin: '15px 1px 1px 10px'}));
panel_rb_selection.add(aoi_select_region);
panel_sub_selection.add(aoi_select_subbasin);
panel_basin_selection.add(panel_rb_selection).add(panel_sub_selection);
selectionPanel.add(panel_basin_selection);
selectionPanel.add(chartpanel);

layer_select.setValue(5);//start with Option 5
var started=0;
layer_active=1;


  
var notesShow = false;
function notesButtonHandler() {
  if(notesShow){
    notesShow = false;
    notesPanel.style().set('shown', false);
    notesButton.setLabel('See notes');
  } else {
    notesShow = true;
    notesPanel.style().set('shown', true);
    notesButton.setLabel('Hide notes');    
  }
}


var chartNotes = ui.Label({
  value: 'User Interaction:',
  style: {fontSize: '12px', margin: '8px 8px 1px 8px', fontWeight: 'bold'}
});
var chartNote2 = ui.Label({
  value: '• Click on any glacier polygon on the map to display live glacier information. ',
  style: {fontSize: '12px', margin: '1px 8px 1px 8px'}
});

var chartNote3 = ui.Label({
  value: '• Use the date slider to browse through decadal snow cover fraction (SCF) composites from 2001 to present.',
  style: {fontSize: '12px', margin: '1px 8px 1px 8px'},
});

var chartNote1 = ui.Label({
  value: '• Select a basin to visualize summary snow metrics at the basin level.',
  style: {fontSize: '12px', margin: '1px 8px 1px 8px'},
});

var mapNotes = ui.Label({
  value: 'Available Indicators:',
  style: {fontSize: '12px', margin: '8px 8px 1px 8px', fontWeight: 'bold'}
});

var mapNote1 = ui.Label({
  value: '• Snowline Elevation (SLA) by aspect: Derived for each basin and decadal time step.',
  style: {fontSize: '12px', margin: '1px 8px 1px 8px'},
});
var mapNote2 = ui.Label({
  value: '• Fractional Snow Cover (FSC): Mean FSC over the basin, within glacier boundaries, and at user-selected points of interests.',
  style: {fontSize: '12px', margin: '1px 8px 1px 8px'},
});
var mapNote3 = ui.Label({
  value: '• Snow Water Equivalents (SWE): Mean SWE over the basin and at user-selected points of interests.',
  style: {fontSize: '12px', margin: '1px 8px 1px 8px'},
});
var mapNote4 = ui.Label({
  value: '• First Day of No Snow: Mean over the basin and at user-selected points of interests.',
  style: {fontSize: '12px', margin: '1px 8px 1px 8px'},
});

var urlNotes = ui.Label({
  value: 'Methodology:',
  style: {fontSize: '12px', margin: '8px 8px 1px 8px', fontWeight: 'bold'}
});

var urlNote1 = ui.Label({
  value: '• MODIS fractional snow cover data is converted to binary using a 50% FSC threshold.',
  style: {fontSize: '12px', margin: '1px 8px 1px 8px'},
});

var urlNote2 = ui.Label({
  value: '• Elevation values are sampled at snowline edge pixels using the SRTM 30m DEM.',
  style: {fontSize: '12px', margin: '1px 8px 1px 8px'},
});

var urlNote3 = ui.Label({
  value: '• SWE and SLA metrics are updated live for each 10-day (decadal) period. Other metrics are available at monthly resolution up to the last calendar year.',
  style: {fontSize: '12px', margin: '1px 8px 1px 8px'},
});

// var layoutNotes = ui.Label({
//   value: 'Map Export:',
//   style: {fontSize: '12px', margin: '8px 8px 1px 8px', fontWeight: 'bold'}
// });

// var layoutNote1 = ui.Label({
//   value: '• To download the crop map of the selected year, first click on "Open Crop and Irrigation Map Download Panel".' +
//     ' Depending on the desired export resolution, the crop map is split into tiles, that each need to be downloaded separately. Click on each tile and then on the download link in the download panel.',
//   style: {fontSize: '12px', margin: '1px 8px 1px 8px'},
// });

// var layoutNote2 = ui.Label({
//   value: '• Due to lower grid resolution, maps of the selected dataset for comparison and the selected year can be downloaded at once by clicking on the download link that is generated by checking the second export checkbox.',
//   style: {fontSize: '12px', margin: '1px 8px 1px 8px'},
// });

var creditNotes = ui.Label({
  value: 'Data Sources:',
  style: {fontSize: '12px', margin: '8px 8px 1px 8px', fontWeight: 'bold'}
});

var creditsLabel1 = ui.Label({
  value: '• MODIS Snow Cover Products: MOD10A1 (Terra), MYD10A1 (Aqua), 500 m, daily. More information on the layers is available under Layer Details',
  style: {fontSize: '12px', margin: '1px 8px 1px 8px'}
});

var creditsLabel2 = ui.Label({
  value: '• Digital Elevation Model: SRTM v3 (NASA), 30 m resolution.',
  style: {fontSize: '12px', margin: '1px 8px 1px 8px'}
});

var creditsLabel3 = ui.Label({
  value: '• Glacier Data: GLIMS database (2023), based on the Randolph Glacier Inventory (RGI v6.0).',
  style: {fontSize: '12px', margin: '1px 8px 1px 8px'}
});

var creditsLabel4 = ui.Panel([
  ui.Label({
    value: '• Basin Boundaries: CA-discharge',
    style: {fontSize: '12px', margin: '1px 8px 1px 8px'}
  }),  ui.Label({value:' (Marti et al. 2023)', style: {fontSize: '12px', margin: '1px 8px 1px 0px'},
  targetUrl: 'https://www.nature.com/articles/s41597-023-02474-8'}),
  ], ui.Panel.Layout.flow('horizontal'), {margin: '0px 0px 0px 0px', padding: '0px 0px 0px 0px'});

  
// var UserGuideNotes_left = ui.Label({
//   value: 'Link to Methodology:',
//   style: {fontSize: '12px', margin: '8px 8px 1px 8px', fontWeight: 'bold'}
// });

// var creditsLabel3 = ui.Label({
//     value: 'Link to User Guide',
//     style: {fontSize: '12px', margin: '8px 8px 1px 8px'}, //, margin: '1px 8px 8px 8px'
//     targetUrl: user_guide_path
//   });
  
var creditNotes_a = ui.Label({
  value: 'Contact:',
  style: {fontSize: '12px', margin: '8px 8px 1px 8px', fontWeight: 'bold'}
});

var creditsLabel1_a = ui.Panel([
  ui.Label({
    value: 'hydrosolutions ltd.',
    style: {fontSize: '12px', margin: '8px 8px 1px 8px'},
    targetUrl: 'https://www.hydrosolutions.ch'
  }),
  ui.Label(' (ragettli@hydrosolutions.ch)', {fontSize: '12px', margin: '8px 8px 1px 0px'}),
  ], ui.Panel.Layout.flow('horizontal'), {margin: '0px 0px 0px 0px', padding: '0px 0px 0px 0px'});

var notesButton = ui.Button({label: 'See notes', onClick: notesButtonHandler});
var notesPanel = ui.Panel({
  widgets: [
    chartNotes,
    chartNote1,
    chartNote2,
    chartNote3,
    mapNotes,
    mapNote1,
    mapNote2,
    mapNote3,
    mapNote4,
    urlNotes,
    urlNote1,
    urlNote2,
    urlNote3,
    // layoutNotes,
    // layoutNote1,
    // layoutNote2,
    creditNotes,
    creditsLabel1,
    creditsLabel2,
    creditsLabel3,
    creditsLabel4,
    // UserGuideNotes_left,
    // creditsLabel3,
    creditNotes_a,
    creditsLabel1_a
  ],
  style: {shown: false}
});

var panel4notes=ui.Panel({widgets: [],layout: ui.Panel.Layout.flow('vertical')});
var instruction=ui.Label('Click on a glacier or select a river basin', {color: 'red',height: '29px',margin: '15px 1px 1px 10px'});

var whitespacepanel=ui.Panel({style: {
    height: '650px',
    },widgets: [instruction],layout: ui.Panel.Layout.flow('vertical')});
panel4notes.add(whitespacepanel);
panel4notes.add(ui.Label({style: {backgroundColor: 'black',padding: '1px',width: '240px',height: '1px',margin: '15px 1px 1px 10px'}}));
panel4notes.add(notesButton); 
panel4notes.add(notesPanel);

chartpanel.add(panel4notes);
