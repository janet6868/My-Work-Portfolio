#@title updated - Process the images and extract flooded areas
#!pip install rasterio rasterstats fiona geopandas geemap -q

#if using colab
using_colab = False
if using_colab:
  from google.colab import drive
  drive.mount ('/content/drive', force_remount=True)

import os
from rasterio.plot import show
import matplotlib.pyplot as plt
import geemap.colormaps as cm
import ee
import numpy as np
import pandas as pd
import geopandas as gpd
import folium
from datetime import datetime, date, timedelta
from matplotlib.dates import DateFormatter, DayLocator
os.chdir('G:/My Drive/Remote_sensing/SRV_flooding_detection_models/Dagana/workflow/new_flow/Paddy-Flooding-Detection')
from datetime import datetime
from IPython.display import display
import geemap
from branca.colormap import LinearColormap
import pandas as pd
#import altair as alt
import numpy as np
import folium
import geemap.foliumap as geema
from geemap.basemaps import GoogleMapsTileProvider
from tqdm import tqdm

from s2_flooding_detection import *

year = '2022'
# Define the date range for processing
start_date = '2022-01-17'
end_date = '2022-06-30'
# Process flooding data and create DataFrame for analysis
run_detection_flooding(aoi= dagana, grid=grid, start_date=start_date, end_date=end_date, year=year)