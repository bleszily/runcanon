<script lang="ts">
  import KpiCard from "$lib/components/KpiCard.svelte";
  import RecentProposals from "$lib/components/RecentProposals.svelte";
  import TopSkillsChart from "$lib/components/TopSkillsChart.svelte";
  import GoalGauge from "$lib/components/GoalGauge.svelte";
  import type { PageData } from "./$types";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  const activeSkills = $derived(data.skills.filter((s) => s.status === "active").length);
  const pendingProposals = $derived(data.proposals.filter((p) => p.status === "pending").length);
</script>

<svelte:head>
  <title>Overview - RunCanon Dashboard</title>
</svelte:head>

<div class="space-y-6">
  <div class="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
    <div>
      <h1 class="text-3xl font-bold tracking-tight">Overview</h1>
      <p class="text-[hsl(var(--muted-foreground))]">Self-updating skill management for AI agents.</p>
    </div>
    <div class="text-sm text-[hsl(var(--muted-foreground))]">
      {data.stats.trajectoryCount} trajectories · {data.stats.skillCount} entitled skills
    </div>
  </div>

  <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
    <KpiCard
      title="Active Skills"
      value={activeSkills}
      icon="skills"
      trend={data.kpi.skillsTrend}
      sparkline={data.kpi.skillsSparkline}
    />
    <KpiCard
      title="Pending Proposals"
      value={pendingProposals}
      icon="proposals"
      trend={data.kpi.proposalsTrend}
      sparkline={data.kpi.proposalsSparkline}
      gradient="from-[hsl(var(--accent))] to-[hsl(var(--primary))]"
    />
    <KpiCard
      title="Trajectories"
      value={data.trajectories.length}
      icon="trajectories"
      trend={data.kpi.trajectoriesTrend}
      sparkline={data.kpi.trajectoriesSparkline}
      gradient="from-[hsl(var(--success))] to-[hsl(var(--primary-hover))]"
    />
    <KpiCard
      title="Goal Alignment"
      value={`${Math.round(data.stats.goalAlignment * 100)}%`}
      icon="autonomy"
      trend={data.kpi.alignmentTrend}
      gradient="from-[hsl(var(--primary))] to-[hsl(var(--primary-hover))]"
    />
  </div>

  <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
    <div class="lg:col-span-2">
      <RecentProposals proposals={data.proposals} />
    </div>
    <div class="space-y-6">
      <GoalGauge value={data.stats.goalAlignment} />
      <TopSkillsChart skills={data.skills} />
    </div>
  </div>
</div>
