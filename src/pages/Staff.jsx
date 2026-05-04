import { useBuilding } from '../contexts/BuildingContext';
import StaffDashboard from '../components/reports/StaffDashboard';
import StaffRoster from '../components/admin/StaffRoster';

export default function Staff() {
  const { building, fiscalYear } = useBuilding();

  if (!building || !fiscalYear) {
    return <div className="flex items-center justify-center h-64 text-gray-400">Loading...</div>;
  }

  if (!building.settings?.trackPersonalBudgets) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center text-gray-400">
          <p className="text-lg font-medium">Personal budget tracking is not enabled.</p>
          <p className="text-sm mt-1">Enable it in Admin → Building Settings.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <StaffDashboard building={building} fiscalYear={fiscalYear} />
    </div>
  );
}
