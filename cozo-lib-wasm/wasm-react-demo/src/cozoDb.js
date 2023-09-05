import initCozoDb, { CozoDb } from "cozo-lib-wasm";
import { getAllItems } from "./idbUtils";

let db = undefined;

const initializeScript = `
{
    :create pin {
        cid: String =>
        type: Int
    }
}
{
    :create particle {
        cid: String =>
        mime: String,
        text: String,
        blocks: Int,
        size: Int,
        sizeLocal: Int,
        type: String
    }
}
{
    :create refs {
        parent: String,
        child: String
    }
}
{
    :create link {
        from: String,
        to: String =>
        neuron_address: String
    }
}`;

function DbService() {
  let dbSchema = {};

  async function init() {
    if (db) {
      return db;
    }

    await initCozoDb();
    db = CozoDb.new();
    window.db = db;

    const [keys, values] = await getAllItems();
    db.import_from_indexdb(keys, values);

    // Init Db Schema
    dbSchema = initDbSchema();
    console.log("DBSchema", dbSchema);

    return db;
  }

  const initDbSchema = () => {
    const tables = ["pin", "particle", "refs"];
    const schemas = Object.fromEntries(
      tables.map((table) => {
        const fields = mapResultToList(runCommand(`::columns ${table}`));
        const keys = fields.filter((c) => c.is_key).map((c) => c.column);
        const values = fields.filter((c) => !c.is_key).map((c) => c.column);
        const tableSchema = {
          keys,
          values,
          columns: fields.reduce((obj, field) => {
            obj[field.column] = field;
            return obj;
          }, {}),
        };
        return [table, tableSchema];
      })
    );

    return schemas;
  };

  const generatePutCommand = (tableName) => {
    const { keys, values } = dbSchema[tableName];
    const hasValues = values.length > 0;

    return !hasValues
      ? `:put ${tableName} {${keys}}`
      : `:put ${tableName} {${keys} => ${values}}`;
  };

  const mapResultToList = (result) => {
    const headers = result.headers;
    const rows = result.rows;
    const templateObj = headers.reduce((acc, header) => {
      acc[header] = null;
      return acc;
    }, {});

    return rows.map((row) => {
      const clonedObj = Object.assign({}, templateObj);
      row.forEach((value, index) => {
        const key = headers[index];
        clonedObj[key] = value;
      });
      return clonedObj;
    });
  };

  const applyIndex = (result) => {
    const rows = result.rows;
    const index = result.headers.reduce((acc, column, index) => {
      acc[column] = index;
      return acc;
    }, {});

    return { rows, index };
  };

  const runCommand = (command) => {
    console.log("----runCommand----", command, db);
    const resultStr = db.run(command, "");
    const result = JSON.parse(resultStr);
    if (result.code) {
      return { error: result.display };
    }

    return result;
  };

  const mapObjectToArray = (obj, columns) => {
    const str = columns
      .map((col) => {
        return col.type === "String" ? `"${obj[col.column]}"` : obj[col.column];
      })
      .join(", ");
    return `[${str}]`;
  };

  const generateAtomCommand = (tableName, items) => {
    const tableSchema = dbSchema[tableName];
    const colKeys = Object.keys(tableSchema.columns);
    const colValues = Object.values(tableSchema.columns);

    return `?[${colKeys.join(", ")}] <- [${items
      .map((item) => mapObjectToArray(item, colValues))
      .join(", ")}]`;
  };

  const executePutCommand = (tableName, array) => {
    const atomCommand = generateAtomCommand(tableName, array);
    const putCommand = generatePutCommand(tableName);
    const command = `${atomCommand}\r\n${putCommand}`;
    return runCommand(command);
  };

  const executeBatchPutCommand = (tableName, array, batchSize = 10) => {
    const putCommand = generatePutCommand(tableName);

    for (let i = 0; i < array.length; i += batchSize) {
      const batch = array.slice(i, i + batchSize);
      const atomCommand = generateAtomCommand(tableName, batch);
      const command = `${atomCommand}\r\n${putCommand}`;
      runCommand(command);
    }
  };

  const executeGetCommand = (tableName, conditionArr = []) => {
    const conditionsStr =
      conditionArr.length > 0 ? `, ${conditionArr.join(", ")} ` : "";
    const tableSchema = dbSchema[tableName];
    const getCommmand = `?[${Object.keys(tableSchema.columns).join(
      ", "
    )}] := *${tableName}{${Object.keys(tableSchema.columns).join(
      ", "
    )}} ${conditionsStr}`;
    return applyIndex(runCommand(getCommmand));
  };

  return { init, executePutCommand, executeGetCommand, executeBatchPutCommand };
}

export default DbService();
