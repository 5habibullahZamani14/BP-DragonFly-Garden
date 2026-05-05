const fs = require('fs');

let content = fs.readFileSync('src/components/garden/PaymentCounterView.tsx', 'utf8');

// 1. Update imports
content = content.replace(
  'import { fetchUnpaidOrders, fetchPaidOrders, fetchPaymentMethods, processPayment, addOrderItem, fetchMenuItems } from "@/lib/api";',
  'import { fetchUnpaidOrders, fetchPaidOrders, fetchPaymentMethods, processPayment, addOrderItem, fetchMenuItems, fetchEmployees, fetchSettings } from "@/lib/api";'
);

// 2. Remove AUTHORIZED_EMPLOYEES
content = content.replace(/const AUTHORIZED_EMPLOYEES: Employee\[\] = \[\s*\{ name: "epm1", id: "111" \},\s*\{ name: "epm2", id: "222" \},\s*\{ name: "epm3", id: "333" \},\s*\{ name: "epm4", id: "444" \},\s*\];/, '');

// 3. Update handleLogin
const oldHandleLogin = `  const handleLogin = () => {
    const matched = AUTHORIZED_EMPLOYEES.find(
      (emp) => emp.id === loginInputId && emp.name === loginInputName
    );

    if (matched) {
      setLoggedInEmployee(matched);
      localStorage.setItem(
        "paymentCounterLogin",
        JSON.stringify({
          id: matched.id,
          name: matched.name,
          date: new Date().toDateString()
        })
      );
    } else {
      notify("error", "Invalid Employee ID or Name");
    }
  };`;

const newHandleLogin = `  const handleLogin = async () => {
    try {
      const employees = await fetchEmployees(false);
      const matched = employees.find(
        (emp: any) => emp.employee_id === loginInputId && emp.name.toLowerCase() === loginInputName.toLowerCase()
      );

      if (matched) {
        setLoggedInEmployee({ name: matched.name, id: matched.employee_id });
        localStorage.setItem(
          "paymentCounterLogin",
          JSON.stringify({
            id: matched.employee_id,
            name: matched.name,
            date: new Date().toDateString()
          })
        );
      } else {
        notify("error", "Invalid Employee ID or Name");
      }
    } catch (e) {
      notify("error", "Failed to verify employee");
    }
  };

  useEffect(() => {
    const checkWorkingHours = async () => {
      if (!loggedInEmployee) return;
      try {
        const settings = await fetchSettings();
        if (settings && settings.work_hours) {
          const { start, end } = settings.work_hours;
          const now = new Date();
          const currentHour = now.getHours();
          const currentMinute = now.getMinutes();
          const currentTimeStr = \`\${currentHour.toString().padStart(2, '0')}:\${currentMinute.toString().padStart(2, '0')}\`;
          
          if (currentTimeStr < start || currentTimeStr > end) {
            handleLogout();
            // Silent logout, or inline UI alert later. For now just clear session
          }
        }
      } catch (e) {
        console.error("Failed to check hours", e);
      }
    };
    
    checkWorkingHours();
    const interval = setInterval(checkWorkingHours, 60000); // Check every minute
    return () => clearInterval(interval);
  }, [loggedInEmployee]);`;

content = content.replace(/\r\n/g, '\n');
const normalizedOld = oldHandleLogin.replace(/\r\n/g, '\n');
content = content.replace(normalizedOld, newHandleLogin);

fs.writeFileSync('src/components/garden/PaymentCounterView.tsx', content);
console.log("Updated PaymentCounterView!");
