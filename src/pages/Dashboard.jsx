import { useBuilding } from '../contexts/BuildingContext';
import SummaryView from '../components/reports/SummaryView';

export default function Dashboard() {
  const { building, fiscalYear } = useBuilding();

  if (!building || !fiscalYear) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        Loading...
      </div>
    );
  }

  return <SummaryView building={building} fiscalYear={fiscalYear} />;
}
