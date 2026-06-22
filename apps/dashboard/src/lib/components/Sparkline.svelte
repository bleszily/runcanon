<script lang="ts">
  interface Props {
    data: number[];
    width?: number;
    height?: number;
    stroke?: string;
    strokeWidth?: number;
    fill?: string;
  }

  let {
    data,
    width = 120,
    height = 40,
    stroke = "hsl(var(--primary))",
    strokeWidth = 2,
    fill = "hsl(var(--primary) / 0.15)",
  }: Props = $props();

  const points = $derived.by(() => {
    if (data.length === 0) return [];
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const padLeft = 4;
    const padRight = 4;
    const padTop = 4;
    const padBottom = 4;
    const drawWidth = width - padLeft - padRight;
    const drawHeight = height - padTop - padBottom;
    return data.map((value, index) => {
      const x = padLeft + (index / Math.max(1, data.length - 1)) * drawWidth;
      const y = padTop + drawHeight - ((value - min) / range) * drawHeight;
      return { x, y };
    });
  });

  const pathD = $derived.by(() => {
    if (points.length === 0) return "";
    const line = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
    const area = `L ${width - 4} ${height - 4} L 4 ${height - 4} Z`;
    return `${line} ${area}`;
  });

  const lineD = $derived.by(() => {
    if (points.length === 0) return "";
    return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  });
</script>

<svg {width} {height} class="overflow-visible">
  {#if points.length > 0}
    <path d={pathD} fill={fill} stroke="none" />
    <path d={lineD} {fill} stroke={stroke} stroke-width={strokeWidth} fill-opacity="0" vector-effect="non-scaling-stroke" />
  {/if}
</svg>
