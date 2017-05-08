module.exports = {
	'extends': 'airbnb-base',
	'plugins': [
		'import'
	],
	'globals': {
		'config': true,
	},
	'rules': {
		'block-scoped-var': 'off',  // TODO: these may be bugs; remove this line and fix :)
		'brace-style': 'off',
		'comma-dangle': 'off',
		'dot-notation': 'off',
		'eqeqeq': 'off',
		'func-names': 'off',
		'generator-star-spacing': ['error', 'neither'],
		'import/no-dynamic-require': 'off',
		'import/no-extraneous-dependencies': 'off',
		'indent': ['error', 'tab', {
			SwitchCase: 2,
			VariableDeclarator: 1,
			outerIIFEBody: 1,
			FunctionDeclaration: {
				parameters: 1,
				body: 1
			},
			FunctionExpression: {
				parameters: 1,
				body: 1
			}
		}],
		'key-spacing': 'off',
		'keyword-spacing': ['error', {
			before: true,
			after: true,
			overrides: {
				case: {after: true},
				catch: {after: false}, // Coonti specific
				for: {after: false}, // Coonti specific
				if: {after: false}, // Coonti specific
				return: {after: true},
				switch: {after: false}, // Coonti specific
				throw: {after: true},
				while: {after: false}, // Coonti specific
			}
		}],
		'max-len': 'off',
		'no-continue': 'off',
		'no-extra-boolean-cast': 'off',
		'no-mixed-operators': 'off',
		'no-mixed-spaces-and-tabs': ['error', 'smart-tabs'],
		'no-param-reassign': 'off',
		'no-plusplus': 'off',
		'no-redeclare': 'off',  // TODO: these may be bugs; remove this line and fix :)
		'no-shadow': 'off',  // TODO: these may be bugs; remove this line and fix :)
		'no-tabs': 'off',
		'no-trailing-spaces': 'error',
		'no-underscore-dangle': 'off',
		'no-unused-vars': ['error', { vars: 'local', args: 'none', ignoreRestSiblings: true }],
		'no-use-before-define': 'off',
		'no-useless-escape': 'off',
		'no-var': 'off',
		'object-shorthand': 'off',
		'one-var': 'off',
		'one-var-declaration-per-line': 'off',
		'prefer-arrow-callback': 'off',
		'prefer-template': 'off',
		'space-before-function-paren': 'off',
		'vars-on-top': 'off',
	},
}
;
