import { useId } from "react";
import { AreaChart, Area, ResponsiveContainer } from "recharts";

// Tiny inline trend chart for stat tiles. `data` is an array of { v } points.
const Sparkline = ({ data, color = "#0ea5e9", height = 28 }) => {
    const gid = useId().replace(/:/g, "");
    if (!data || data.length === 0) return null;
    return (
        <ResponsiveContainer width="100%" height={height}>
            <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                <defs>
                    <linearGradient id={`spark-${gid}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                        <stop offset="100%" stopColor={color} stopOpacity={0} />
                    </linearGradient>
                </defs>
                <Area
                    type="monotone"
                    dataKey="v"
                    stroke={color}
                    strokeWidth={1.75}
                    fill={`url(#spark-${gid})`}
                    dot={false}
                    isAnimationActive={false}
                />
            </AreaChart>
        </ResponsiveContainer>
    );
};

export default Sparkline;
