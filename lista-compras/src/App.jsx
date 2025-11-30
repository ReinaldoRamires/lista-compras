import React, { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import { ShoppingCart, Check, Trash2, Plus, X, Save, RefreshCw, Pencil, Store, Home, ListRestart, Search, Settings } from 'lucide-react';

// --- CONFIGURAÇÃO DO SUPABASE ---
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

export default function App() {
  // --- ESTADOS ---
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  
  // Estados Persistentes (Salvos no navegador)
  const [shoppingMode, setShoppingMode] = useState(() => localStorage.getItem('mercado_mode') === 'true');
  const [marginPct, setMarginPct] = useState(() => Number(localStorage.getItem('mercado_margin')) || 15);
  
  // Filtros
  const [categoryFilter, setCategoryFilter] = useState('Todos');
  const [searchTerm, setSearchTerm] = useState('');
  
  const [formData, setFormData] = useState({
    nome: '', marca: '', categoria: '', corredor: '', quantidade: 1, preco_unitario: ''
  });

  // Salvar preferências sempre que mudarem
  useEffect(() => { localStorage.setItem('mercado_mode', shoppingMode); }, [shoppingMode]);
  useEffect(() => { localStorage.setItem('mercado_margin', marginPct); }, [marginPct]);

  // --- BUSCA DE DADOS ---
  const fetchProducts = async () => {
    if (!supabase) { setLoading(false); return; }
    try {
      const { data, error } = await supabase.from('produtos').select('*');
      if (error) throw error;
      setProducts(data || []);
    } catch (error) { console.error('Erro:', error.message); } finally { setLoading(false); }
  };

  useEffect(() => {
    fetchProducts();
    if (supabase) {
      const sub = supabase.channel('public:produtos')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'produtos' }, () => fetchProducts())
        .subscribe();
      return () => { supabase.removeChannel(sub); };
    }
  }, []);

  // --- LÓGICA DE FILTRO E ORDENAÇÃO ---
  const filteredProducts = useMemo(() => {
    let list = products;

    // 1. Pesquisa (Nome ou Marca)
    if (searchTerm) {
      const lowerTerm = searchTerm.toLowerCase();
      list = list.filter(p => 
        p.nome.toLowerCase().includes(lowerTerm) || 
        (p.marca && p.marca.toLowerCase().includes(lowerTerm))
      );
    }

    // 2. Filtro de Categoria (Só no modo Casa)
    if (!shoppingMode && categoryFilter !== 'Todos') {
      list = list.filter(p => p.categoria === categoryFilter);
    }

    // 3. Modos de Exibição
    if (shoppingMode) {
      // MODO MERCADO: Só o que vou comprar
      list = list.filter(p => p.comprar);
      // Ordenação: 1º Não pegos, 2º Pegos (final), 3º Corredor
      list = list.sort((a, b) => {
        if (a.in_cart !== b.in_cart) return a.in_cart ? 1 : -1; // Jogar pegos pro final
        const cA = parseInt(a.corredor) || 999;
        const cB = parseInt(b.corredor) || 999;
        return cA - cB;
      });
    } else {
      // MODO CASA: Ordem alfabética
      list = list.sort((a, b) => a.nome.localeCompare(b.nome));
    }
    return list;
  }, [products, categoryFilter, shoppingMode, searchTerm]);

  // --- CÁLCULOS ---
  const totalBase = products.filter(p => p.comprar).reduce((acc, p) => acc + (p.preco_unitario * p.quantidade), 0);
  const totalCart = products.filter(p => p.comprar && p.in_cart).reduce((acc, p) => acc + (p.preco_unitario * p.quantidade), 0);
  const totalComMargem = totalBase * (1 + (marginPct/100));

  // --- AÇÕES ---
  const toggleComprar = async (id, status) => {
    setProducts(prev => prev.map(p => p.id === id ? { ...p, comprar: !status } : p));
    if (supabase) await supabase.from('produtos').update({ comprar: !status }).eq('id', id);
  };

  const toggleInCart = async (id, status) => {
    // Atualiza na tela na hora
    setProducts(prev => prev.map(p => p.id === id ? { ...p, in_cart: !status } : p));
    // Manda pro banco
    if (supabase) await supabase.from('produtos').update({ in_cart: !status }).eq('id', id);
  };

  const updatePrice = async (id, val) => {
    if (supabase) await supabase.from('produtos').update({ preco_unitario: val }).eq('id', id);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Excluir?')) {
      setProducts(prev => prev.filter(p => p.id !== id));
      if (supabase) await supabase.from('produtos').delete().eq('id', id);
    }
  };

  const resetList = async () => {
    if (window.confirm('Iniciar novo mês? (Desmarcar tudo)')) {
      setProducts(prev => prev.map(p => ({ ...p, comprar: false, in_cart: false })));
      if (supabase) {
        // Zera 'comprar' e 'in_cart'
        const ids = products.filter(p => p.comprar || p.in_cart).map(p => p.id);
        for (const id of ids) await supabase.from('produtos').update({ comprar: false, in_cart: false }).eq('id', id);
      }
    }
  }

  // --- MODAL ---
  const handleEdit = (p) => {
    setEditingId(p.id);
    setFormData({ nome: p.nome, marca: p.marca||'', categoria: p.categoria||'Geral', corredor: p.corredor||'', quantidade: p.quantidade||1, preco_unitario: p.preco_unitario||'' });
    setIsModalOpen(true);
  };
  const handleNew = () => {
    setEditingId(null);
    setFormData({ nome: '', marca: '', categoria: 'Geral', corredor: '', quantidade: 1, preco_unitario: '' });
    setIsModalOpen(true);
  };
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const payload = { ...formData, preco_unitario: formData.preco_unitario || 0 };
    try {
      if (supabase) {
        if (editingId) await supabase.from('produtos').update(payload).eq('id', editingId);
        else await supabase.from('produtos').insert([{ ...payload, comprar: true }]);
      }
      setIsModalOpen(false); // Fecha o modal e volta pra lista
    } catch (err) { alert(err.message); } finally { setSaving(false); }
  };

  // Categorias únicas + Sugestões
  const uniqueCategories = useMemo(() => {
    const padrao = ['Geral', 'Hortifruti', 'Limpeza', 'Higiene', 'Carnes', 'Bebidas'];
    const doBanco = products.map(p => p.categoria).filter(Boolean);
    return [...new Set([...padrao, ...doBanco])].sort();
  }, [products]);

  return (
    <div className={`min-h-screen pb-24 font-sans text-slate-900 transition-colors duration-500 ${shoppingMode ? 'bg-slate-100' : 'bg-white'}`}>
      
      {/* HEADER */}
      <header className={`text-white p-4 sticky top-0 z-20 shadow-lg transition-colors duration-300 ${shoppingMode ? 'bg-blue-600' : 'bg-emerald-600'}`}>
        <div className="max-w-3xl mx-auto">
          {/* Linha Superior: Título e Botão de Modo */}
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-2">
              {shoppingMode ? <ShoppingCart className="animate-bounce" /> : <Home />}
              <div>
                <h1 className="font-bold text-lg leading-none">{shoppingMode ? 'No Mercado' : 'Planejamento'}</h1>
                {shoppingMode && <span className="text-[10px] opacity-80">Pegos: R$ {totalCart.toFixed(2)}</span>}
              </div>
            </div>
            <button onClick={() => setShoppingMode(!shoppingMode)} className="bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide flex items-center gap-2 transition">
              {shoppingMode ? 'Voltar' : 'Mercado'}
              {shoppingMode ? <Home size={14}/> : <Store size={14}/>}
            </button>
          </div>

          {/* Linha Inferior: Totais e Margem */}
          <div className="grid grid-cols-2 gap-4 items-end">
            <div>
              <p className="text-[10px] opacity-80 uppercase">Total Gôndola</p>
              <p className="font-bold text-2xl">R$ {totalBase.toFixed(2)}</p>
            </div>
            <div className="text-right border-l border-white/20 pl-4 relative group">
              <label className="text-[10px] opacity-80 uppercase flex items-center justify-end gap-1 cursor-pointer">
                Margem <Pencil size={10}/>
                <input 
                  type="number" 
                  value={marginPct} 
                  onChange={(e) => setMarginPct(Number(e.target.value))}
                  className="w-8 bg-transparent border-b border-white/50 text-center text-white outline-none focus:border-white font-bold ml-1"
                />%
              </label>
              <p className="font-bold text-xl text-yellow-300">R$ {totalComMargem.toFixed(2)}</p>
            </div>
          </div>

          {/* Barra de Pesquisa */}
          <div className="mt-3 relative">
            <Search className="absolute left-3 top-2.5 text-white/60" size={16} />
            <input 
              type="text" 
              placeholder="Buscar produto..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-black/10 text-white placeholder-white/60 rounded-lg pl-9 pr-3 py-2 text-sm outline-none focus:bg-black/20 transition"
            />
            {searchTerm && <button onClick={() => setSearchTerm('')} className="absolute right-3 top-2.5 text-white/60 hover:text-white"><X size={16}/></button>}
          </div>
        </div>
      </header>

      {/* FILTROS (Apenas modo Casa) */}
      {!shoppingMode && (
        <div className="sticky top-[160px] bg-slate-50 z-10 border-b border-slate-200 shadow-sm overflow-x-auto">
          <div className="max-w-3xl mx-auto p-2 flex gap-2">
            <button onClick={() => setCategoryFilter('Todos')} className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${categoryFilter === 'Todos' ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 border'}`}>Todos</button>
            {uniqueCategories.map(cat => (
              <button key={cat} onClick={() => setCategoryFilter(cat)} className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${categoryFilter === cat ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 border'}`}>{cat}</button>
            ))}
            <button onClick={resetList} className="ml-auto px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-600 border border-red-200 flex items-center gap-1 flex-shrink-0"><ListRestart size={12}/> Limpar Mês</button>
          </div>
        </div>
      )}

      {/* LISTA */}
      <main className="max-w-3xl mx-auto p-3 space-y-3 mt-2">
        {loading && <p className="text-center text-slate-500">Carregando...</p>}
        {!loading && filteredProducts.map(product => (
          <div key={product.id} className={`bg-white p-4 rounded-xl shadow-sm border-l-4 flex flex-col gap-3 transition-all duration-300 ${shoppingMode && product.in_cart ? 'border-gray-300 opacity-50 bg-gray-50 scale-95' : product.comprar ? 'border-emerald-500 opacity-100' : 'border-slate-300 opacity-60'}`}>
            
            {/* TOPO DO CARD */}
            <div className="flex items-start gap-3">
              {/* Botão de Check Principal */}
              <button 
                onClick={() => shoppingMode ? toggleInCart(product.id, product.in_cart) : toggleComprar(product.id, product.comprar)}
                className={`mt-1 w-8 h-8 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors 
                  ${shoppingMode 
                    ? (product.in_cart ? 'bg-gray-400 border-gray-400 text-white' : 'border-blue-500 text-transparent bg-white') 
                    : (product.comprar ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 text-transparent bg-white')
                  }`}
              >
                <Check size={18} strokeWidth={3} />
              </button>

              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start">
                  <h3 className={`font-bold text-lg leading-tight ${(shoppingMode && product.in_cart) || (!shoppingMode && !product.comprar) ? 'text-slate-500 line-through' : 'text-slate-800'}`}>
                    {product.nome}
                  </h3>
                  <div className="flex gap-1">
                    <button onClick={() => handleEdit(product)} className="text-slate-300 hover:text-emerald-600 p-2"><Pencil size={18}/></button>
                    {!shoppingMode && <button onClick={() => handleDelete(product.id)} className="text-slate-300 hover:text-red-500 p-2"><Trash2 size={18}/></button>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 mt-1 text-xs text-slate-500">
                  <span className="bg-slate-100 px-2 py-0.5 rounded font-medium border">{product.marca || '-'}</span>
                  <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-medium border border-blue-100">{product.categoria}</span>
                  {product.corredor && <span className={`px-2 py-0.5 rounded font-bold border flex items-center gap-1 ${shoppingMode ? 'bg-yellow-100 text-yellow-800 border-yellow-300 text-sm' : 'bg-yellow-50 text-yellow-700 border-yellow-200'}`}>{shoppingMode && <span className="text-[10px] uppercase">Corredor</span>}{product.corredor}</span>}
                </div>
              </div>
            </div>

            {/* BARRA DE PREÇO (Só aparece se estiver marcado para comprar) */}
            {product.comprar && (
              <div className={`flex items-center p-2 rounded-lg border mt-1 ${shoppingMode && product.in_cart ? 'bg-gray-100 border-gray-200' : 'bg-slate-50 border-slate-100'}`}>
                <div className="flex flex-col items-center px-2 border-r"><span className="text-[10px] text-slate-400 font-bold uppercase">Qtd</span><span className="font-mono text-lg font-bold text-slate-700">{product.quantidade}</span></div>
                <div className="flex-1 px-3"><label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Preço Un.</label><div className="flex items-center gap-1"><span className="text-sm text-slate-400">R$</span><input type="number" step="0.01" defaultValue={product.preco_unitario} onBlur={(e) => updatePrice(product.id, e.target.value)} className="w-full bg-transparent font-mono text-xl font-bold text-slate-800 outline-none"/></div></div>
                <div className="text-right pl-2"><span className="text-[10px] text-slate-400 font-bold uppercase block">Total</span><span className={`font-bold text-lg ${shoppingMode && product.in_cart ? 'text-gray-500' : 'text-emerald-600'}`}>{(product.quantidade * product.preco_unitario).toFixed(0)}</span></div>
              </div>
            )}
          </div>
        ))}
        <div className="h-24"></div>
      </main>

      <button onClick={() => { handleNew(); setIsModalOpen(true); }} className="fixed bottom-6 right-6 bg-emerald-600 hover:bg-emerald-700 text-white p-4 rounded-full shadow-xl z-40 transition active:scale-90"><Plus size={32} /></button>

      {/* MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-6 shadow-2xl animate-in slide-in-from-bottom-10 duration-300">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">{editingId ? 'Editar' : 'Novo'} Produto</h2>
              <button onClick={() => setIsModalOpen(false)} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200 text-slate-500"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div><label className="block text-sm mb-1 text-slate-600">Nome</label><input required name="nome" value={formData.nome} onChange={(e) => setFormData({...formData, nome: e.target.value})} className="w-full p-3 border rounded-lg bg-slate-50 outline-none focus:ring-2 focus:ring-emerald-500"/></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm mb-1 text-slate-600">Marca</label><input name="marca" value={formData.marca} onChange={(e) => setFormData({...formData, marca: e.target.value})} className="w-full p-3 border rounded-lg bg-slate-50 outline-none focus:ring-2 focus:ring-emerald-500"/></div>
                <div><label className="block text-sm mb-1 text-slate-600">Categoria</label>
                  <input list="cat-list" name="categoria" value={formData.categoria} onChange={(e) => setFormData({...formData, categoria: e.target.value})} className="w-full p-3 border rounded-lg bg-slate-50 outline-none focus:ring-2 focus:ring-emerald-500" placeholder="Selecione..."/>
                  <datalist id="cat-list">{uniqueCategories.map(c => <option key={c} value={c}/>)}</datalist>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div><label className="block text-sm mb-1 text-slate-600">Corredor</label><input name="corredor" value={formData.corredor} onChange={(e) => setFormData({...formData, corredor: e.target.value})} className="w-full p-3 border rounded-lg bg-slate-50 outline-none text-center font-bold"/></div>
                <div><label className="block text-sm mb-1 text-slate-600">Qtd</label><input type="number" name="quantidade" value={formData.quantidade} onChange={(e) => setFormData({...formData, quantidade: e.target.value})} className="w-full p-3 border rounded-lg bg-slate-50 outline-none text-center font-bold"/></div>
                <div><label className="block text-sm mb-1 text-slate-600">Preço</label><input type="number" step="0.01" name="preco_unitario" value={formData.preco_unitario} onChange={(e) => setFormData({...formData, preco_unitario: e.target.value})} className="w-full p-3 border rounded-lg bg-slate-50 outline-none text-center"/></div>
              </div>
              <button type="submit" disabled={saving} className="w-full bg-emerald-600 text-white font-bold py-4 rounded-xl mt-4 flex justify-center items-center gap-2">{saving ? <RefreshCw className="animate-spin"/> : <Save/>} Salvar</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}