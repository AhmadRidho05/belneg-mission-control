import {
  kodamSummary, kodimSummary, sankeyKodamHierarchy, sankeyAllKodamKodimKab,
  provinceBentukTree, statusBreakdown,
  akreditasiBreakdown, akreditasiByProvince, internetBreakdown, listrikBreakdown,
  topYayasan, scatterLuasAkreditasi, trendPesertaDidik, bubbleKabupaten,
  skTimelineAll, skTimelineByAkreditasi, skTimelineByStatus,
  prabowoKabSummary, kodamPolitikSummary, skTimelineByPrabowo,
  koramilStatsPerKodam, koramilLoadScatter, koramilBentukDistribution, koramilByKorem,
} from "@/lib/db";
import { VisualisasiShell } from "./visualisasi-shell";

export const dynamic = "force-dynamic";

export default async function VisualisasiPage() {
  const [
    kodam, kodim, sankeyTop5, sankeyAll, bentukTree, status, akr, akrByProv,
    internet, listrik, yayasan, scatter, trend, bubble,
    skAll, skByAkrPendirian, skByAkrOperasional, skByStatusPendirian, skByStatusOperasional,
    prabowoKab, kodamPolitik, skByPrabowo,
    koramilKodam, koramilScatter, koramilBentuk, koramilKorem,
  ] = await Promise.all([
    kodamSummary(),
    kodimSummary(),
    sankeyKodamHierarchy(5),
    sankeyAllKodamKodimKab(5),
    provinceBentukTree(),
    statusBreakdown(),
    akreditasiBreakdown(),
    akreditasiByProvince(),
    internetBreakdown(),
    listrikBreakdown(),
    topYayasan(15),
    scatterLuasAkreditasi(4000),
    trendPesertaDidik(),
    bubbleKabupaten(),
    skTimelineAll(),
    skTimelineByAkreditasi("pendirian"),
    skTimelineByAkreditasi("operasional"),
    skTimelineByStatus("pendirian"),
    skTimelineByStatus("operasional"),
    prabowoKabSummary(),
    kodamPolitikSummary(),
    skTimelineByPrabowo(),
    koramilStatsPerKodam(),
    koramilLoadScatter(),
    koramilBentukDistribution(),
    koramilByKorem(15),
  ]);

  return (
    <VisualisasiShell
      sankeyTop5={sankeyTop5}
      sankeyAll={sankeyAll}
      bentukTree={bentukTree}
      status={status}
      akr={akr}
      akrByProv={akrByProv}
      internet={internet}
      listrik={listrik}
      yayasan={yayasan}
      scatter={scatter}
      trend={trend}
      bubble={bubble}
      kodam={kodam}
      kodim={kodim}
      skAll={skAll}
      skByAkrPendirian={skByAkrPendirian}
      skByAkrOperasional={skByAkrOperasional}
      skByStatusPendirian={skByStatusPendirian}
      skByStatusOperasional={skByStatusOperasional}
      prabowoKab={prabowoKab}
      kodamPolitik={kodamPolitik}
      skByPrabowo={skByPrabowo}
      koramilKodam={koramilKodam}
      koramilScatter={koramilScatter}
      koramilBentuk={koramilBentuk}
      koramilKorem={koramilKorem}
    />
  );
}
