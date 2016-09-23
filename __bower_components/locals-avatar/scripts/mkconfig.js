var glob = require('glob');
var path = require('path');
var util = require('util');


function onlyUnique(value, index, self) {
	return self.indexOf(value) === index;
}
// options is optional
glob("./images/avatarmale/*", null, function(er, files) {

	//var buffer = [];
	//var colors = {};


	layers = {};

	files.sort();

	files.forEach(function(file) {

		if (file.indexOf('icon') > -1) {
			return;
		}

		var filename = path.basename(file, '.png');
		//console.log('--', filename);
		var parts = filename.split('-');

		// format 
		// 1 type
		// 2 layer
		// 3 variant
		// 4 color 

		var index_type = 2;
		var index_layer = 2;
		var index_variant = 3;
		var index_color = 4;


		if (!layers[parts[index_type]]) {
			//console.log('new layer from file ', filename);
			layers[parts[index_type]] = {
				name: parts[index_type],
				icon: '__this.resolveUrl("' + path.dirname(file) + '/' + parts[index_layer] + '-icon.png")__',
				iconselected: '__this.resolveUrl("' + path.dirname(file) + '/' + parts[index_layer] + '-icon-selected.png")__',
				variants: [],
				colors: [],
				images: {}
			};
			//console.log("after init , layers[parts[index_type]]['variants'] is a ", typeof layers[parts[index_type]]['variants']);
		};

		//if (!layers[parts[index_type]]['variants'][parts[index_variant]]){
		//console.log("layers[parts[index_type]]['variants'] is a ", typeof layers[parts[index_type]]['variants']);
		//console.log('new variant from file ',filename);
		layers[parts[index_type]]['variants'].push(parts[index_variant]);
		layers[parts[index_type]]['variants'] = layers[parts[index_type]]['variants'].filter(onlyUnique);
		layers[parts[index_type]]['colors'].push(parts[index_color]);
		layers[parts[index_type]]['colors'] = layers[parts[index_type]]['colors'].filter(onlyUnique);
		layers[parts[index_type]]['images'][parts[index_variant] + '-' + parts[index_color]] = '__this.resolveUrl("' + file + '")__';

		//}

		// if (!layers[parts[index_type]]['colors'][parts[index_color]]){
		// 	layers[parts[index_type]]['colors'].push([parts[index_color]]);
		// }



		/*



				colors[parts[index_color]] = {
					name: parts[index_color],
					class: parts[index_color]
				};

				if (!buffer[parts[index_layer]]) {
					buffer[parts[index_layer]] = {
						name: parts[index_layer],
						icon: '__this.resolveUrl("' + path.dirname(file) + '/' + parts[index_layer] + '-icon.png")__',
						options: []
					};
				}
				//if (!buffer[parts[1]].options[parts[2]]){
				var haystack = buffer[parts[index_layer]].options;
				var needle = parts[index_variant];
				//console.log('c',haystack,needle,haystack[needle]);
				//			if (!buffer[parts[1]].options[parts[2]]){
				//				buffer[parts[1]].options[parts[2]] = {};
				//			}
				buffer[parts[index_layer]].options.push({
					//				name : filename,
					tile: '__this.resolveUrl("' + path.dirname(file) + '/' + filename + '.png")__',
					//variant: parts[2],
					group: parts[index_color]
				});

		*/

	});


	//console.log(util.inspect(layers, false, null));

	// now the config layers are in an object. Convert this to an array

	var out_layers = [];
	var out_defaultstate = [];

	Object.keys(layers).forEach(function(key) {
		if (layers[key].name) {
			out_layers.push(layers[key]);
			out_defaultstate.push([0,0]);
		}
		//	console.log(util.inspect(buffer[key],false,null));
		//	console.log('-----');
	});

	// Object.keys(colors).forEach(function(key) {
	// 	if (key != 'undefined') {
	// 		buffer2.colors.push(colors[key]);
	// 	}
	// });

	var str = util.inspect({
		layers: out_layers,
		defaultstate: out_defaultstate
	}, false, null);

	str = str.replace(/__\'/g, '');
	str = str.replace(/\'__/g, '');
	console.log(str);



	//var config=



})