const express = require("express");
const app = express();
const cors = require("cors");
const excel = require("exceljs");
const fs = require("fs");
const multer = require("multer");
const path = require("path");
const { check, validationResult } = require("express-validator");

// middelware to use cors
app.use(cors());
// middelware to use public folder
app.use(express.static("public"));


const workbook = new excel.Workbook();
const workbookCache = {};

const upload = multer({
    storage: multer.diskStorage({
        destination: "uploads/",
        filename: (req, file, cb) => {
            if (!fs.existsSync("uploads/")) {
                fs.mkdirSync("uploads/");
            }
            if (!fs.existsSync("exports/")) {
                fs.mkdirSync("exports/");
            }
            cb(null, file.originalname);
        },
    }),
});

const deleteXlsx = (filePath) => {
    console.log('Eliminando archivo', filePath);
    fs.unlink(filePath, (err) => {
        if (err) {
            console.log('Error al eliminar el archivo excel: ', err);
        } else {
            console.log(` ${filePath} eliminado`);
        }
    });
};

const validateFileType = check("excelFile", "El tipo de archivo debe ser .xlsx")
    .custom((value, { req }) => req.file && req.file.originalname.endsWith(".xlsx"));

const prohibitedWordsSet = new Set(["NOMBRE", "TELEFONO", "NUMERO", "CELULAR"]);

app.post(
    "/export",
    [
        upload.single("excelFile"),
        validateFileType,
    ],

    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        let workbookPromise;
        if (workbookCache[req.file.path]) {
            workbookPromise = workbookCache[req.file.path];
        } else {
            workbookPromise = workbook.xlsx.readFile(req.file.path);
            workbookCache[req.file.path] = workbookPromise;
        }
        await workbookPromise;

        const worksheet = workbook.getWorksheet(1);
        const nombreColumn = worksheet.getColumn(1);
        const telefonoColumn = worksheet.getColumn(2);
        let data = nombreColumn.values.slice(1).map((nombre, index) => ({
            nombre,
            telefono: telefonoColumn.values[index + 1],
        }));

        if (data.length === 0) {
            return res.status(400).json({ errors: [{ msg: "El archivo excel no contiene datos" }] });
        }

        if (
            prohibitedWordsSet.has(data[0].nombre.toUpperCase()) ||
            prohibitedWordsSet.has(data[0].telefono.toUpperCase())
        ) {
            data.shift();
        }

        if (data.length === 0) {
            return res.status(400).json({ errors: [{ msg: "El archivo excel no contiene datos" }] });
        }

        const vcf = data.reduce(
            (vcf, { nombre, telefono }) =>
                vcf + `BEGIN:VCARD\nVERSION:2.1\nN:${nombre};Twoc -;;;\nFN:Twoc - ${nombre}\nTEL;CELL:${telefono}\nTEL;CELL:${telefono}\nEND:VCARD\n`,""
        );

        const vcfFileName = path.join(__dirname, "exports", `${(req.file.originalname).replace('.xlsx', '')}.vcf`);

        await fs.promises.writeFile(vcfFileName, vcf);

        res.download(vcfFileName, (err) => {
            if (err) {
                console.log("Error al descargar el archivo", err);
                res.status(500).json({ errors: [{ msg: "Error al descargar el archivo" }] })
            } else {
                // deleteXlsx(req.file.path);
            }
        });

    }
);

// when user acces to get('/') return the file /public/index.html
app.get("/", (req, res) => {
    res.sendFile(__dirname + "/public/index.html");
});

app.get("/inicio", (req, res) => {
    res.sendFile(__dirname + "/public/index.html");
});

// when user acces to get('/') return hello world
app.get("/home", (req, res) => {
    res.send("Hello world!");
});


// return 'no page found' if user try to acces to a page that not exist
app.use((req, res) => {
    res.status(404).send("No page found");
});


app.listen(3000, () => {
    console.log("Server running on port 3000");
});