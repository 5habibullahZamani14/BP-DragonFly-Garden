const fs = require('fs');

let content = fs.readFileSync('src/controllers/orderController.js', 'utf8');

const oldStr = `    for (const item of items) {
      const menuItem = menuItemMap.get(item.menu_item_id);

      await run(
        \`
          INSERT INTO order_items (order_id, menu_item_id, quantity, price_at_order_time, notes)
          VALUES (?, ?, ?, ?, ?)
        \`,
        [orderInsert.lastID, item.menu_item_id, item.quantity, menuItem.price, item.notes]
      );
    }

    await run("COMMIT");`;

const newStr = `    for (const item of items) {
      const menuItem = menuItemMap.get(item.menu_item_id);

      await run(
        \`
          INSERT INTO order_items (order_id, menu_item_id, quantity, price_at_order_time, notes)
          VALUES (?, ?, ?, ?, ?)
        \`,
        [orderInsert.lastID, item.menu_item_id, item.quantity, menuItem.price, item.notes]
      );

      const ingredients = await all(
        "SELECT inventory_item_id, quantity_required FROM menu_item_ingredients WHERE menu_item_id = ?",
        [item.menu_item_id]
      );
      
      for (const ing of ingredients) {
        const amountToDeduct = ing.quantity_required * item.quantity;
        await run(
          "UPDATE inventory_items SET current_stock = current_stock - ? WHERE id = ?",
          [amountToDeduct, ing.inventory_item_id]
        );
        
        const invItem = await get("SELECT name FROM inventory_items WHERE id = ?", [ing.inventory_item_id]);
        
        if (invItem) {
          await run(
            \`INSERT INTO grand_archive_logs (category, action, actor_name, target_id, target_name, details)
             VALUES (?, ?, ?, ?, ?, ?)\`,
            [
              'INVENTORY', 'DEDUCT', 'System (Customer Order)', 
              ing.inventory_item_id.toString(), invItem.name, 
              JSON.stringify({ 
                menu_item: menuItem.name, 
                amount_deducted: amountToDeduct,
                order_id: orderInsert.lastID
              })
            ]
          );
        }
      }
    }

    await run("COMMIT");`;

content = content.replace(/\r\n/g, '\n');
const normalizedOldStr = oldStr.replace(/\r\n/g, '\n');

content = content.replace(normalizedOldStr, newStr);

fs.writeFileSync('src/controllers/orderController.js', content);
console.log("Updated!");
