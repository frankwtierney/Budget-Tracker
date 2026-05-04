import { useBuilding } from '../contexts/BuildingContext';
import VendorList from '../components/admin/VendorList';

export default function Vendors() {
  const { building } = useBuilding();

  if (!building) {
    return <div className="flex items-center justify-center h-64 text-gray-400">Loading...</div>;
  }

  return <VendorList building={building} />;
}
