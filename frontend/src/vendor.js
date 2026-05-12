import CodeMirror from 'codemirror';
import 'codemirror/mode/yaml/yaml.js';
import 'codemirror/addon/hint/show-hint.js';
import 'codemirror/lib/codemirror.css';
import 'codemirror/theme/material-darker.css';
import 'codemirror/addon/hint/show-hint.css';

import jsyaml from 'js-yaml';
import JSZip from 'jszip';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.js?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

window.CodeMirror = CodeMirror;
window.jsyaml = jsyaml;
window.JSZip = JSZip;
window.pdfjsLib = pdfjsLib;
