import initCozoDb, { CozoDb } from "cozo-lib-wasm";

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

// const initializeScript = `
// {
//     :create pin {
//         cid: String =>
//         type: Int
//     }
// }`;

function DbService() {
  let dbSchema = {};

  async function init() {
    if (db) {
      return db;
    }
    console.log("----initCozoDb----1111");

    const input = await initCozoDb();
    console.log("----initCozoDb----input", input);
    // const [keys, values] = await getAllItems();
    db = await CozoDb.new_from_indexed_db("cozo-idb", "cyb-cozo");
    console.log("----initCozoDb----", db);
    // db = CozoDb.new(keys, values);
    window.db = db;

    // Init Db Schema
    dbSchema = initDbSchema();
    console.log("DBSchema", dbSchema);

    return db;
  }

  const initDbSchema = () => {
    let relationsDataTable = runCommand("::relations");

    // TODO: refact
    if (relationsDataTable.rows.length === 0) {
      runCommand(initializeScript);
      relationsDataTable = runCommand("::relations");

      //   const res = runCommand(
      //     '?[cid, type] <- [["cid1", 0]]\r\n:put pin {cid => type}'
      //   );
      //   console.log("--!! insert pin", res);
    }

    const tableNames = relationsDataTable.rows.map((row) => row[0]);

    const schemas = Object.fromEntries(
      tableNames.map((table) => {
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
    const resultStr = db.run(command, "");
    const result = JSON.parse(resultStr);
    console.log("----runCommand----", command, result);

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

  const executePutCommand = async (tableName, array) => {
    const atomCommand = generateAtomCommand(tableName, array);
    const putCommand = generatePutCommand(tableName);
    const command = `${atomCommand}\r\n${putCommand}`;
    const res = runCommand(command);
    await CozoDb.wait_for_indexed_db_writes();
  };

  const executeBatchPutCommand = async (tableName, array, batchSize = 10) => {
    const putCommand = generatePutCommand(tableName);

    for (let i = 0; i < array.length; i += batchSize) {
      const batch = array.slice(i, i + batchSize);
      const atomCommand = generateAtomCommand(tableName, batch);
      const command = `${atomCommand}\r\n${putCommand}`;
      const res = runCommand(command);
      //   console.log("----executeBatchPutCommand----", tableName, res);
      await CozoDb.wait_for_indexed_db_writes();
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

  return {
    init,
    executePutCommand,
    executeGetCommand,
    executeBatchPutCommand,
    runCommand,
  };
}

export default DbService();
