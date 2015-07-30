/* global L */
(function (window, document, undefined) {
  
var M = {};
window.M = M;

(function () {
    M.mime = "text/mapml";
  }());
  
M.MapMLLayer = L.Class.extend({
    includes: L.Mixin.Events,
    options: {
        maxNext: 10,
        projection: "WGS84"
	},    
    initialize: function (href, options) {
        this._href = href;
        this._initExtent();
        L.setOptions(this, options);
    },
    onAdd: function (map) {
        this._map = map;
        if (!this._mapml) {
          this._mapml = M.mapMl(null,{
              opacity: this.options.opacity,
              onEachFeature: function(feature, layer) {
                var type;
                if (layer instanceof L.MultiPolygon) {
                  type = "MultiPolygon";
                } else if (layer instanceof L.MultiPolyline) {
                  type = "MultiLinestring";
                } else if (layer instanceof L.Polygon) {
                  type = "Polygon";
                } else if (layer instanceof L.Polyline) {
                  type = "LineString";
                } else if (layer instanceof L.FeatureGroup) {
                  type = "GeometryCollection";
                } else if (layer instanceof L.Marker) {
                  type = "Point";
                } else {
                  type = "Unknown";
                }
                var popupContent = "<p>Type: " +  type + "</p>";
                var props = feature.children;
                for (var i = 0; i < props.length; i++) {
                    popupContent += props[i].tagName+ " = " + props[i].innerHTML  +"<br>";
                }  
                layer.bindPopup(popupContent, {autoPan:false});
              }
            });
        }
        map.addLayer(this._mapml);
        
        if (!this._tileLayer) {
          this._tileLayer = M.mapMLTileLayer(this.href?this.href:this._href, this.options);
        }
        if (!this._el) {
            this._el = this._tileLayer._el = L.DomUtil.create('div', 'mapml-layer leaflet-zoom-hide');
        }
        map.addLayer(this._tileLayer);
        this._tileLayer._container.appendChild(this._el);
        map.on('viewreset', this._reset, this);
        map.on('moveend', this._update, this);
        // if the extent has been initialized and received, update the map,
        // otherwise wait for 'moveend' to be triggered by the callback
        /* TODO establish the minZoom, maxZoom, attribution for the _tileLayer based on
         * info received from mapml server. */
        if (this._extent)
            this._update();
    },
    addTo: function (map) {
        map.addLayer(this);
        return this;
    },
    onRemove: function (map) {
        this._mapml.clearLayers();
        map.removeLayer(this._mapml);
        map.removeLayer(this._tileLayer);
        map.off('viewreset', this._reset, this);
        map.off('moveend', this._update, this);
    },
    getZoomBounds: function () {
        if (!this._extent) return;
        var bounds = {};
        var v1 = this._extent.querySelector('[type=zoom]').getAttribute('min'),
            v2 = this._extent.querySelector('[type=zoom]').getAttribute('max');
        bounds.min = Math.min(v1,v2);
        bounds.max = Math.max(v1,v2);
        return bounds;
    },
    getBounds: function() {
        if (!this._extent) return;
        var xmin,ymin,xmax,ymax,v1,v2;
        v1 = this._extent.querySelector('[type=xmin]').getAttribute('min');
        v2 = this._extent.querySelector('[type=xmax]').getAttribute('min');
        xmin = Math.min(v1,v2);
        v1 = this._extent.querySelector('[type=xmin]').getAttribute('max');
        v2 = this._extent.querySelector('[type=xmax]').getAttribute('max');
        xmax = Math.max(v1,v2);
        v1 = this._extent.querySelector('[type=ymin]').getAttribute('min');
        v2 = this._extent.querySelector('[type=ymax]').getAttribute('min');
        ymin = Math.min(v1,v2);
        v1 = this._extent.querySelector('[type=ymin]').getAttribute('max');
        v2 = this._extent.querySelector('[type=ymax]').getAttribute('max');
        ymax = Math.max(v1,v2);
        return new L.LatLngBounds(new L.LatLng(ymin, xmin), new L.LatLng(ymax,xmax));
    },
    getAttribution: function () {
        return this.options.attribution;
    },
    _initExtent: function() {
        if (!this._href) {return;}
        var layer = this;
        var xhr = new XMLHttpRequest();
        _get(this._href, _processResponse);
        function _get(url, fCallback  ) {
            xhr.onreadystatechange = function () { 
              if(this.readyState === this.DONE) {
                if(this.status === 200 && this.callback) {
                  this.callback.apply(this, this.arguments ); 
                  return;
                } else if (this.status === 406 && 
                           this.response !== null && 
                           this.responseXML.querySelector('error')) {
                     console.error('406');
                     xhr.abort();
                }
              }};
            xhr.arguments = Array.prototype.slice.call(arguments, 2);
            xhr.onload = fCallback;
            xhr.onerror = function () { console.error(this.statusText); };
            xhr.open("GET", url);
            xhr.setRequestHeader("Accept",M.mime);
            xhr.overrideMimeType("text/xml");
            xhr.send();
        };
        function _processResponse() {
            if (this.responseXML) {
                var xml = this.responseXML;
                var serverExtent = xml.getElementsByTagName('extent')[0];
                var licenseLink =  xml.querySelectorAll('link[rel=license]')[0],
                    licenseTitle = licenseLink.getAttribute('title'),
                    licenseUrl = licenseLink.getAttribute('href'),
                    attText = '<a href="' + licenseUrl + '" title="'+licenseTitle+'">'+licenseTitle+'</a>';
                L.setOptions(layer,{projection:xml.querySelectorAll('input[type=projection]')[0].getAttribute('value'), attribution:attText });
                layer["_extent"] = serverExtent;
                if (layer._map) {
                    layer._map.attributionControl.addAttribution(attText);
                    layer._map.fire('moveend', layer);
                }
            }
        };
    },
    _getMapML: function(url) {
        var layer = this;
        var requestCounter = 0;
        var xhr = new XMLHttpRequest();
        // add a listener to terminate pulling the feed 
        this._map.on('movestart', function() {
          xhr.abort();
        });
        _pull(url, _processResponse);
        function _pull(url, fCallback) {
            xhr.onreadystatechange = function () { 
              if(this.readyState === this.DONE) {
                if(this.status === 200 && this.callback) {
                  this.callback.apply(this, this.arguments ); 
                  return;
                } else if (this.status === 406 && 
                           this.response !== null && 
                           this.responseXML.querySelector('error')) {
                     console.error('406');
                     xhr.abort();
                }
              }};
            xhr.arguments = Array.prototype.slice.call(arguments, 2);
            xhr.onload = fCallback;
            xhr.onerror = function () { console.error(this.statusText); };
            xhr.open("GET", url);
            xhr.setRequestHeader("Accept",M.mime+";projection="+layer.options.projection+";zoom="+layer.zoom);
            xhr.overrideMimeType("text/xml");
            xhr.send();
        };
        function _processResponse() {
            if (this.responseXML) {
              if (requestCounter === 0) {
                var serverExtent = this.responseXML.getElementsByTagName('extent')[0];
                layer._el.appendChild(document.importNode(serverExtent,true));
              }
              if (this.responseXML.getElementsByTagName('feature').length > 0)
                  layer._mapml.addData(this.responseXML);
              if (this.responseXML.getElementsByTagName('tile').length > 0) {
                  var tiles = document.createElement("tiles");
                  var newTiles = this.responseXML.getElementsByTagName('tile');
                  for (var i=0;i<newTiles.length;i++) {
                      tiles.appendChild(document.importNode(newTiles[i], true));
                  }
                  layer._el.appendChild(tiles);
              }
              var next = _parseLink('next',this.responseXML);
              if (next && requestCounter < layer.options.maxNext) {
                  requestCounter++;
                  _pull(next, _processResponse);
              } else {
                  if (layer._el.getElementsByTagName('tile').length > 0) {
                      // would prefer to fire an event here, not quite sure how
                      // to do that...
                      layer._tileLayer._update();
                  }
              }
            }
        };
        function _parseLink(rel, xml) {
            // TODO need to determine the baseUri even if the xml does not contain
            // a <base> element
            // depends on js-uri http://code.google.com/p/js-uri/ 
            var baseUri = new URI(xml.querySelector('base').getAttribute('href'));
            var link = xml.querySelector('link[rel='+rel+']');
            var relLink = link?new URI(link.getAttribute('href')).resolve(baseUri):null;
            return relLink;
        };
    },
    _update: function () {
        var url =  this._calculateUrl();
        if (url) {
          this.href = url;
          this._mapml.clearLayers();
//          this._initEl();
          this._getMapML(url);
        }
    },
    _initEl: function () {
        if (!this._el) {return;}
        var container = this._el;
        while (container.firstChild)
            container.removeChild(container.firstChild);
    },
    _reset: function() {
        this._initEl();
        this._mapml.clearLayers();
        //this._map.removeLayer(this._mapml);
        return;
    },
    _calculateUrl: function(vector) {
        // this function should either return a URL or null, so that its caller
        // can 'disable'/ grey-out the layer in the layer control until such
        // time that the (proposed) request is within the zoom / bounds described
        // by the server in a previous response.
        
        if (!this._el && !this._extent) return this._href;
        var extent = this._el.getElementsByTagName('extent')[0] || this._extent;
        // at this point, if there is no extent, we might have to return
        // one of the cardinal direction link rels...  the issue there is
        // determining in what direction the gesture took the map/
        // for now just return the original href entered by the html author.
        if (!extent) return this._href;
        var action = extent.getAttribute("action");
        if (!action) return null;
        var b = this._map.getBounds();
        var xmin = extent.querySelectorAll("input[type=xmin]")[0];
        var ymin = extent.querySelectorAll("input[type=ymin]")[0];
        var xmax = extent.querySelectorAll("input[type=xmax]")[0];
        var ymax = extent.querySelectorAll("input[type=ymax]")[0];
        if (!xmin|| !ymin || !xmax || !ymax ) return  null;
        var xminValue = parseFloat(xmin.getAttribute("min"));
        var xminName = (xmin.getAttribute('name')?xmin.getAttribute('name').trim():'xmin');
        var yminValue = parseFloat(ymin.getAttribute("min"));
        var yminName = (ymin.getAttribute('name')?ymin.getAttribute('name').trim():'ymin');
        var xmaxValue = parseFloat(xmax.getAttribute("max"));
        var xmaxName = (xmax.getAttribute('name')?xmax.getAttribute('name').trim():'xmax');
        var ymaxValue = parseFloat(ymax.getAttribute("max"));
        var ymaxName = (ymax.getAttribute('name')?ymax.getAttribute('name').trim():'ymax');
        var bboxTemplate = "";
        bboxTemplate += xminName + "={" + xminName + "}" + "&";
        bboxTemplate += yminName + "={" + yminName + "}" + "&";
        bboxTemplate += xmaxName + "={" + xmaxName + "}" + "&";
        bboxTemplate += ymaxName + "={" + ymaxName + "}";
        
        if (!b.intersects(this.getBounds())) return null;
        
        var zoom = extent.querySelectorAll("input[type=zoom]")[0];
        var projection = extent.querySelectorAll("input[type=projection]")[0];
        if ( !zoom || !projection) return null;

        var min = parseInt(zoom.getAttribute("min")),
            max = parseInt(zoom.getAttribute("max"));

        var values = {};
        var mapZoom = this._map.getZoom();
        if ( min <= mapZoom && mapZoom <= max) {
          values.zoom = mapZoom;
        } else {
          return null;
        }
        
        var zoomName = zoom.getAttribute('name')?zoom.getAttribute('name').trim():'zoom';
        var zoomTemplate = zoomName + "={" + zoomName + "}";

        values.xmin = b.getWest();
        values.ymin = b.getSouth();
        values.xmax = b.getEast();
        values.ymax = b.getNorth();

        if ( projection.getAttribute("value") === this.options.projection) {
          values.projection = projection.getAttribute("value");
        } else {
          return null;
        }
        
        var projectionName = projection.getAttribute('name')?projection.getAttribute('name').trim():'projection';
        var projectionTemplate = projectionName + "={" + projectionName + "}";
        
        var requestTemplate = bboxTemplate + "&" + zoomTemplate + "&" + projectionTemplate;
        action += ((action.search(/\?/g) === -1) ? "?" : "&") + requestTemplate;
        return L.Util.template(action, values);
    }
});
M.mapMLLayer = function (url, options) {
	return new M.MapMLLayer(url, options);
};
M.MapMLTileLayer = L.TileLayer.extend({
	onAdd: function (map) {
		this._map = map;
		this._animated = map._zoomAnimated;

		// create a container div for tiles
		this._initContainer();

		map.on({
			'viewreset': this._reset,
			'moveend': this._update
		}, this);
		if (this._animated) {
			map.on({
				'zoomanim': this._animateZoom,
				'zoomend': this._endZoomAnim
			}, this);
		}
                // not sure what this does... leave it.
		if (!this.options.updateWhenIdle) {
			this._limitedUpdate = L.Util.limitExecByInterval(this._update, 150, this);
			map.on('move', this._limitedUpdate, this);
		}
                L.TileLayer.prototype.onAdd.call(this, map);

	},
        _update: function() {
            if (!this._map) { return; }
            if (zoom > this.options.maxZoom || zoom < this.options.minZoom) {
                return;
            }
            var map = this._map,
                bounds = map.getPixelBounds(),
                zoom = map.getZoom(),
                tileSize = this._getTileSize();
            var tileBounds = L.bounds(
                bounds.min.divideBy(tileSize)._floor(),
                bounds.max.divideBy(tileSize)._floor());
            // this modified version uses tile info previously loaded by mapml,
            // does not generate tile references itself.
            var tiles = this._el.getElementsByTagName('tile');
              this._addTiles(tiles);
            if (this.options.unloadInvisibleTiles || this.options.reuseTiles) {
                    this._removeOtherTiles(tileBounds);
            }
        },
        /* the original in leaflet is called '_addTilesFromCenterOut, which has
         * a bounds argument.  In this case, we let the server determine the order
         * in which the tiles should be loaded. */
	_addTiles: function (tiles) {
		var queue = [];
		var point;
                for (var i=0;i<tiles.length;i++) {
                    point = new L.Point(tiles[i].getAttribute('x'), tiles[i].getAttribute('y'));
                    if (this._tileShouldBeLoaded(point)) {
                        queue.push(tiles[i]);
                    }
                }

		var tilesToLoad = queue.length;

		if (tilesToLoad === 0) { return; }

		var fragment = document.createDocumentFragment();

		// if its the first batch of tiles to load
		if (!this._tilesToLoad) {
			this.fire('loading');
		}

		this._tilesToLoad += tilesToLoad;

		for (i = 0; i < tilesToLoad; i++) {
			this._addTile(queue[i], fragment);
		}

		this._tileContainer.appendChild(fragment);
	},
	_addTile: function (tileToLoad, container) {
                var tilePoint = new L.Point(tileToLoad.getAttribute('x'), tileToLoad.getAttribute('y'));
		var tilePos = this._getTilePos(tilePoint);

		// get unused tile - or create a new tile
		var tile = this._getTile();

		L.DomUtil.setPosition(tile, tilePos, L.Browser.chrome);

		this._tiles[tilePoint.x + ':' + tilePoint.y] = tile;
                var url = tileToLoad.getAttribute('src');
		this._loadTile(tile, url);

		if (tile.parentNode !== this._tileContainer) {
			container.appendChild(tile);
		}
	},
	_loadTile: function (tile, url) {
		tile._layer  = this;
		tile.onload  = this._tileOnLoad;
		tile.onerror = this._tileOnError;

		//this._adjustTilePoint(tilePoint);
		tile.src     = url;

		this.fire('tileloadstart', {
			tile: tile,
			url: tile.src
		});
	}
  
});

M.mapMLTileLayer = function (url, options) {
	return new M.MapMLTileLayer(url, options);
};
/*
 * M.MapML turns any MapML feature data into a Leaflet layer. Based on L.GeoJSON.
 */

M.MapML = L.FeatureGroup.extend({
	initialize: function (mapml, options) {
                options.stroke = false;
                options.fill = false;
		L.setOptions(this, options);

		this._layers = {};

		if (mapml) {
			this.addData(mapml);
		}
	},

	addData: function (mapml) {
		var features = mapml.nodeType === Node.DOCUMENT_NODE ? mapml.getElementsByTagName("feature") : null,
		    i, len, feature;
            
                var stylesheet = mapml.nodeType === Node.DOCUMENT_NODE ? mapml.querySelector("link[rel=stylesheet]") : null;
                if (stylesheet) {
                  
                var baseEl = mapml.querySelector('base'),
                      base = new URI(baseEl?baseEl.getAttribute('href'):mapml.baseURI),
                      link = new URI(stylesheet.getAttribute('href')),
                      stylesheet = link.resolve(base).toString();
                }
                if (stylesheet) {
                  if (!document.head.querySelector("link[href='"+stylesheet+"']")) {
                    var linkElm = document.createElementNS("http://www.w3.org/1999/xhtml", "link");
                    linkElm.setAttribute("href", stylesheet);
                    linkElm.setAttribute("type", "text/css");
                    linkElm.setAttribute("rel", "stylesheet");
                    document.head.appendChild(linkElm);
                  }
                }

		if (features) {
			for (i = 0, len = features.length; i < len; i++) {
				// Only add this if geometry is set and not null
				feature = features[i];
                                var geometriesExist = feature.getElementsByTagName("geometry").length && feature.getElementsByTagName("coordinates").length;
				if (geometriesExist) {
					this.addData(feature);
				}
			}
			return this;
		}

		var options = this.options;

		if (options.filter && !options.filter(mapml)) { return; }

		var layer = M.MapML.geometryToLayer(mapml, options.pointToLayer, options.coordsToLatLng, options);
		layer.feature = mapml.getElementsByTagName('properties')[0];
                
                layer.options.className = mapml.getAttribute('class') ? mapml.getAttribute('class') : null;
		layer.defaultOptions = layer.options;
		this.resetStyle(layer);

		if (options.onEachFeature) {
			options.onEachFeature(layer.feature, layer);
		}

		return this.addLayer(layer);
	},
        
	resetStyle: function (layer) {
		var style = this.options.style;
		if (style) {
			// reset any custom styles
			L.Util.extend(layer.options, layer.defaultOptions);

			this._setLayerStyle(layer, style);
		}
	},

	setStyle: function (style) {
		this.eachLayer(function (layer) {
			this._setLayerStyle(layer, style);
		}, this);
	},

	_setLayerStyle: function (layer, style) {
		if (typeof style === 'function') {
			style = style(layer.feature);
		}
		if (layer.setStyle) {
			layer.setStyle(style);
		}
	}
});

L.extend(M.MapML, {
	geometryToLayer: function (mapml, pointToLayer, coordsToLatLng, vectorOptions) {
		var geometry = mapml.tagName === 'feature' ? mapml.getElementsByTagName('geometry')[0] : mapml,
		    coords = geometry.getElementsByTagName('coordinates'),
		    layers = [],
		    latlng, latlngs, i, len;

		coordsToLatLng = coordsToLatLng || this.coordsToLatLng;

		switch (geometry.firstElementChild.tagName) {
		case 'Point':
                        var coordinates = [];
                        coords[0].innerHTML.split(/\s+/gi).forEach(parseNumber,coordinates);
			latlng = coordsToLatLng(coordinates);
                        
                        /* can't use L.Icon.Default because L gets the path from
                         * the <script> element for Leaflet, but that is not available
                         * inside a Web Component / Custom Element */
                        var pathToImages = "http://cdn.leafletjs.com/leaflet-0.7.3/images/";
			return pointToLayer ? pointToLayer(mapml, latlng) : 
                                new L.Marker(latlng, {icon: L.icon({
                                    iconUrl: pathToImages+"marker-icon.png",
                                    iconRetinaUrl: pathToImages+"marker-icon-2x.png",
                                    shadowUrl: pathToImages+"marker-shadow.png",
                                    iconSize: [25, 41],
                                    iconAnchor: [12, 41],
                                    popupAnchor: [1, -34],
                                    shadowSize: [41, 41]})});

		case 'MultiPoint':
                        throw new Error('Not implemented yet');
//			for (i = 0, len = coords.length; i < len; i++) {
//				latlng = coordsToLatLng(coords[i]);
//				layers.push(pointToLayer ? pointToLayer(mapml, latlng) : new L.Marker(latlng));
//			}
//			return new L.FeatureGroup(layers);

		case 'LineString':
                        var coordinates = [];
                        coords[0].innerHTML.match(/(\S+ \S+)/gi).forEach(splitCoordinate, coordinates);
			latlngs = this.coordsToLatLngs(coordinates, 0, coordsToLatLng);
			return new L.Polyline(latlngs, vectorOptions);

		case 'Polygon':
                        var coordinates = new Array(coords.length);
                        for (var i=0;i<coords.length;i++) {
                          coordinates[i]=[];
                          coords[i].innerHTML.match(/(\S+ \S+)/gi).forEach(splitCoordinate, coordinates[i]);
                        }
			latlngs = this.coordsToLatLngs(coordinates, 1, coordsToLatLng);
			return new L.Polygon(latlngs, vectorOptions);
		case 'MultiLineString':
                        throw new Error('Not implemented yet');
//			latlngs = this.coordsToLatLngs(coords, 1, coordsToLatLng);
//			return new L.MultiPolyline(latlngs, vectorOptions);

		case 'MultiPolygon':
                        throw new Error('Not implemented yet');
//			latlngs = this.coordsToLatLngs(coords, 2, coordsToLatLng);
//			return new L.MultiPolygon(latlngs, vectorOptions);

		case 'GeometryCollection':
                        throw new Error('Not implemented yet');
//			for (i = 0, len = geometry.geometries.length; i < len; i++) {
//
//				layers.push(this.geometryToLayer({
//					geometry: geometry.geometries[i],
//					type: 'Feature',
//					properties: geojson.properties
//				}, pointToLayer, coordsToLatLng, vectorOptions));
//			}
//			return new L.FeatureGroup(layers);

		default:
			throw new Error('Invalid GeoJSON object.');
		}

                function splitCoordinate(element, index, array) {
                  var a = [];
                  element.split(/\s+/gi).forEach(parseNumber,a);
                  this.push(a);
                };

                function parseNumber(element, index, array) {
                  this.push(parseFloat(element));
                };
        },
        

	coordsToLatLng: function (coords) { // (Array[, Boolean]) -> LatLng
		return new L.LatLng(coords[1], coords[0], coords[2]);
	},

	coordsToLatLngs: function (coords, levelsDeep, coordsToLatLng) { // (Array[, Number, Function]) -> Array
		var latlng, i, len,
		    latlngs = [];

		for (i = 0, len = coords.length; i < len; i++) {
			latlng = levelsDeep ?
			        this.coordsToLatLngs(coords[i], levelsDeep - 1, coordsToLatLng) :
			        (coordsToLatLng || this.coordsToLatLng)(coords[i]);

			latlngs.push(latlng);
		}

		return latlngs;
	},

	latLngToCoords: function (latlng) {
		var coords = [latlng.lng, latlng.lat];

		if (latlng.alt !== undefined) {
			coords.push(latlng.alt);
		}
		return coords;
	},

	latLngsToCoords: function (latLngs) {
		var coords = [];

		for (var i = 0, len = latLngs.length; i < len; i++) {
			coords.push(L.MapML.latLngToCoords(latLngs[i]));
		}

		return coords;
	}
});
 
M.mapMl = function (mapml, options) {
	return new M.MapML(mapml, options);
};
// this overrides the private method of Leaflet Path to set the opacity directly
// on the svg path element in the style attribute. Quite a hack, I guess,
// but I didn't want to own the whole class, as it is quite fundamental to stuff
L.Path.include({
	_updateStyle: function () {
                if (this.options.opacity) {
                  this._path.setAttribute('style', 'opacity: ' +this.options.opacity);
                }
	}
});


/* does not support 'base' layers.  Adds _enable/_disable */
M.MapMLLayerControl = L.Control.Layers.extend({
	initialize: function (overlays, options) {
		L.setOptions(this, options);
                this.options.collapsed = false;

		this._layers = {};
		this._lastZIndex = 0;
		this._handlingClick = false;

		for (var i in overlays) {
			this._addLayer(overlays[i], i, true);
		}
	},
	_enable: function(layer) {
          
        },
	_disable: function(layer) {
          
        },
	onAdd: function (map) {
		this._initLayout();
		this._update();

		map
		    .on('layeradd', this._onLayerChange, this)
		    .on('layerremove', this._onLayerChange, this)
                    .on('moveend', this._onMapMoveEnd, this);

		return this._container;
	},

	onRemove: function (map) {
		map
		    .off('layeradd', this._onLayerChange, this)
		    .off('layerremove', this._onLayerChange, this)
                    .off('moveend', this._onMapMoveEnd, this);
	},
        _onMapMoveEnd: function(e) {
                var zoom = this._map.getZoom(),
                    bounds = this._map.getBounds(),
                    zoomBounds, i, obj, lyrBounds, visible;
		for (i in this._layers) {
			obj = this._layers[i];
                        if (obj.layer._extent) {
                            lyrBounds = obj.layer.getBounds();
                            zoomBounds = obj.layer.getZoomBounds();
                            visible = bounds.intersects(lyrBounds) && this._withinZoomBounds(zoom, zoomBounds);
                            if (!visible) {
                                obj.input.disabled = true;
                                obj.input.nextElementSibling.style.fontStyle = 'italic';
                            } else {
                                obj.input.disabled = false;
                                obj.input.style = null;
                                obj.input.nextElementSibling.style.fontStyle = null;
                            }
                        }
		}
        },
        _withinZoomBounds: function(zoom, range) {
            return range.min <= zoom && zoom <= range.max;
        },
	_addItem: function (obj) {
		var label = document.createElement('label'),
		    input,
		    checked = this._map.hasLayer(obj.layer);

		if (obj.overlay) {
			input = document.createElement('input');
			input.type = 'checkbox';
			input.className = 'leaflet-control-layers-selector';
			input.defaultChecked = checked;
                        obj.input = input;
		} else {
			input = this._createRadioElement('leaflet-base-layers', checked);
		}

		input.layerId = L.stamp(obj.layer);

		L.DomEvent.on(input, 'click', this._onInputClick, this);

		var name = document.createElement('span');
		name.innerHTML = ' ' + obj.name;

		label.appendChild(input);
		label.appendChild(name);

		var container = obj.overlay ? this._overlaysList : this._baseLayersList;
		container.appendChild(label);

		return label;
	}
        
});
M.mapMlLayerControl = function (layers, options) {
	return new M.MapMLLayerControl(layers, options);
};


}(window, document));