export interface TreeNode {
  id: string;
  name: string;
  path: string;
  children: TreeNode[];
  parent: TreeNode | null;
  isLeaf: boolean;
}

export interface Edge {
  from: string;
  to: string;
}

export interface SubtreeData {
  total: number;
  nH: number;
  eH: number;
  optEH: number;
  intEdges: Edge[];
}

export interface Preset {
  name: string;
  description: string;
  data: string;
}

export const COLORS = {
  bg: "#07090e",
  bg1: "#0b0e17",
  bg2: "#0f1320",
  border: "#181e30",
  border2: "#1e2640",
  dim: "#252e48",
  muted: "#4a5a78",
  text: "#9aaac0",
  bright: "#c8d8e8",
  amber: "#f0b040",
  green: "#38d890",
  blue: "#4488ff",
  red: "#e04848",
  violet: "#9060e0",
};

export const PRESETS: Record<string, Preset> = {
  numpy: {
    name: "numpy core",
    description: "~55 nodes",
    data: `digraph numpy {
"numpy/__init__.py" -> "numpy/core/__init__.py"
"numpy/__init__.py" -> "numpy/lib/__init__.py"
"numpy/__init__.py" -> "numpy/linalg/__init__.py"
"numpy/__init__.py" -> "numpy/fft/__init__.py"
"numpy/__init__.py" -> "numpy/random/__init__.py"
"numpy/__init__.py" -> "numpy/ma/__init__.py"
"numpy/__init__.py" -> "numpy/testing/__init__.py"
"numpy/core/__init__.py" -> "numpy/core/multiarray.py"
"numpy/core/__init__.py" -> "numpy/core/numeric.py"
"numpy/core/__init__.py" -> "numpy/core/fromnumeric.py"
"numpy/core/__init__.py" -> "numpy/core/arrayprint.py"
"numpy/core/__init__.py" -> "numpy/core/defchararray.py"
"numpy/core/__init__.py" -> "numpy/core/records.py"
"numpy/core/__init__.py" -> "numpy/core/function_base.py"
"numpy/core/__init__.py" -> "numpy/core/shape_base.py"
"numpy/core/__init__.py" -> "numpy/core/einsumfunc.py"
"numpy/core/__init__.py" -> "numpy/core/_type_aliases.py"
"numpy/core/__init__.py" -> "numpy/core/overrides.py"
"numpy/core/numeric.py" -> "numpy/core/multiarray.py"
"numpy/core/numeric.py" -> "numpy/core/_type_aliases.py"
"numpy/core/fromnumeric.py" -> "numpy/core/multiarray.py"
"numpy/core/fromnumeric.py" -> "numpy/core/numeric.py"
"numpy/core/fromnumeric.py" -> "numpy/core/overrides.py"
"numpy/core/arrayprint.py" -> "numpy/core/multiarray.py"
"numpy/core/arrayprint.py" -> "numpy/core/numeric.py"
"numpy/core/arrayprint.py" -> "numpy/core/fromnumeric.py"
"numpy/core/shape_base.py" -> "numpy/core/numeric.py"
"numpy/core/shape_base.py" -> "numpy/core/overrides.py"
"numpy/core/einsumfunc.py" -> "numpy/core/multiarray.py"
"numpy/core/einsumfunc.py" -> "numpy/core/numeric.py"
"numpy/core/overrides.py" -> "numpy/core/multiarray.py"
"numpy/lib/__init__.py" -> "numpy/lib/arraysetops.py"
"numpy/lib/__init__.py" -> "numpy/lib/function_base.py"
"numpy/lib/__init__.py" -> "numpy/lib/index_tricks.py"
"numpy/lib/__init__.py" -> "numpy/lib/nanfunctions.py"
"numpy/lib/__init__.py" -> "numpy/lib/npyio.py"
"numpy/lib/__init__.py" -> "numpy/lib/polynomial.py"
"numpy/lib/__init__.py" -> "numpy/lib/shape_base.py"
"numpy/lib/__init__.py" -> "numpy/lib/stride_tricks.py"
"numpy/lib/__init__.py" -> "numpy/lib/twodim_base.py"
"numpy/lib/__init__.py" -> "numpy/lib/type_check.py"
"numpy/lib/__init__.py" -> "numpy/lib/ufunclike.py"
"numpy/lib/__init__.py" -> "numpy/lib/utils.py"
"numpy/lib/function_base.py" -> "numpy/core/numeric.py"
"numpy/lib/function_base.py" -> "numpy/core/overrides.py"
"numpy/lib/function_base.py" -> "numpy/lib/twodim_base.py"
"numpy/lib/nanfunctions.py" -> "numpy/core/numeric.py"
"numpy/lib/nanfunctions.py" -> "numpy/lib/function_base.py"
"numpy/lib/nanfunctions.py" -> "numpy/core/overrides.py"
}`,
  },
  pandas: {
    name: "pandas",
    description: "~48 nodes",
    data: `digraph pandas {
"pandas/__init__.py" -> "pandas/core/__init__.py"
"pandas/__init__.py" -> "pandas/io/__init__.py"
"pandas/__init__.py" -> "pandas/util/__init__.py"
"pandas/core/__init__.py" -> "pandas/core/frame.py"
"pandas/core/__init__.py" -> "pandas/core/series.py"
"pandas/core/__init__.py" -> "pandas/core/index.py"
"pandas/core/frame.py" -> "pandas/core/series.py"
"pandas/core/frame.py" -> "pandas/core/index.py"
"pandas/core/series.py" -> "pandas/core/index.py"
"pandas/core/series.py" -> "pandas/core/base.py"
"pandas/core/index.py" -> "pandas/core/base.py"
"pandas/io/__init__.py" -> "pandas/io/common.py"
"pandas/io/__init__.py" -> "pandas/io/csv.py"
"pandas/io/__init__.py" -> "pandas/io/excel.py"
"pandas/io/csv.py" -> "pandas/io/common.py"
"pandas/io/excel.py" -> "pandas/io/common.py"
}`,
  },
  flask: {
    name: "flask",
    description: "~35 nodes",
    data: `digraph flask {
"flask/__init__.py" -> "flask/app.py"
"flask/__init__.py" -> "flask/blueprints.py"
"flask/__init__.py" -> "flask/ctx.py"
"flask/__init__.py" -> "flask/globals.py"
"flask/__init__.py" -> "flask/helpers.py"
"flask/__init__.py" -> "flask/templating.py"
"flask/__init__.py" -> "flask/testing.py"
"flask/__init__.py" -> "flask/wrappers.py"
"flask/__init__.py" -> "flask/signals.py"
"flask/app.py" -> "flask/blueprints.py"
"flask/app.py" -> "flask/ctx.py"
"flask/app.py" -> "flask/globals.py"
"flask/app.py" -> "flask/helpers.py"
"flask/app.py" -> "flask/templating.py"
"flask/app.py" -> "flask/signals.py"
"flask/blueprints.py" -> "flask/sansio/blueprints.py"
"flask/ctx.py" -> "flask/globals.py"
"flask/ctx.py" -> "flask/signals.py"
"flask/ctx.py" -> "flask/wrappers.py"
"flask/globals.py" -> "flask/ctx.py"
"flask/helpers.py" -> "flask/globals.py"
"flask/helpers.py" -> "flask/ctx.py"
"flask/helpers.py" -> "flask/signals.py"
"flask/templating.py" -> "flask/globals.py"
"flask/templating.py" -> "flask/helpers.py"
"flask/templating.py" -> "flask/signals.py"
"flask/testing.py" -> "flask/app.py"
"flask/testing.py" -> "flask/ctx.py"
"flask/testing.py" -> "flask/globals.py"
"flask/wrappers.py" -> "flask/globals.py"
"flask/wrappers.py" -> "flask/helpers.py"
}`,
  },
};

export const PRESET_GROUPS = [
  { label: "Python scientific", keys: ["numpy", "pandas"] },
  { label: "Web frameworks", keys: ["flask"] },
];
