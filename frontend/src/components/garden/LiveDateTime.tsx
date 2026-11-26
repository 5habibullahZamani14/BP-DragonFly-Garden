import { memo, useEffect, useState } from "react";
import { formatDateTime12Hour } from "@/lib/timeFormat";

export const LiveDateTime = memo(function LiveDateTime() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return <>{formatDateTime12Hour(now, true)}</>;
});
