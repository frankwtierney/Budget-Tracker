import { useBuilding } from '../contexts/BuildingContext';
import TransactionsView from '../components/admin/TransactionsView';

export default function Transactions() {
  const { building, fiscalYear } = useBuilding();

  if (!building || !fiscalYear) {
    return <div className="flex items-center justify-center h-64 text-gray-400">Loading...</div>;
  }

  return <TransactionsView building={building} fiscalYear={fiscalYear} />;
}
