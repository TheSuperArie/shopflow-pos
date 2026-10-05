  return (
    <div dir="rtl" className="h-screen flex flex-col bg-[#F5EFE3] text-[#1E2433]" style={{ fontFamily: "Rubik, 'Segoe UI', Tahoma, sans-serif" }}>
      {/* Sales the old offline mode left on this device */}
      <StuckStockBanner onRetry={flushStock} />

      {/* ── Header ── */}
      <header className="bg-[#1E2433] text-[#F5EFE3] px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-xl border border-[#B8925A] flex items-center justify-center shrink-0">
            <Shirt className="w-6 h-6" strokeWidth={1.6} />
          </div>
          <div className="min-w-0">
            <p className="text-xl font-bold leading-tight" style={SERIF}>ShopFlow · קופה</p>
            {branchName && <p className="text-[13px] text-[#D9D1C1] truncate">{branchName}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`flex items-center gap-2 h-10 px-3 rounded-full text-sm ${networkOnline ? 'bg-[#2B3245]' : 'bg-[#8C3B2E]'}`}
            title={networkOnline ? 'מחובר לאינטרנט' : 'אין חיבור לאינטרנט'}>
            {networkOnline ? <Wifi className="w-4 h-4 text-[#6FCF97]" /> : <WifiOff className="w-4 h-4" />}
            <span className="hidden sm:inline">{networkOnline ? 'מחובר' : 'אין אינטרנט'}</span>
          </span>
          <span className="hidden sm:inline text-xl font-medium px-2 tabular-nums" style={SERIF}>{clock}</span>
          <button onClick={() => setShowReturnForm(true)}
            className="h-11 flex items-center gap-2 px-3 sm:px-4 rounded-xl border border-[#4A5268] hover:bg-[#2B3245] transition-colors text-[15px]">
            <RotateCcw className="w-[18px] h-[18px]" /> <span className="hidden sm:inline">החזרה</span>
          </button>
          <button onClick={() => setShowStaffPortal(true)}
            className="h-11 flex items-center gap-2 px-3 sm:px-4 rounded-xl border border-[#4A5268] hover:bg-[#2B3245] transition-colors text-[15px]">
            <Users className="w-[18px] h-[18px]" /> <span className="hidden sm:inline">עובדים</span>
          </button>
          <button onClick={() => setShowCart(!showCart)} aria-label="עגלה"
            className="lg:hidden relative w-11 h-11 rounded-xl border border-[#4A5268] flex items-center justify-center">
            <ShoppingCart className="w-5 h-5" />
            {cartUnits > 0 && (
              <span className="absolute -top-1.5 -left-1.5 min-w-[22px] h-[22px] px-1 rounded-full bg-[#B8925A] text-[#1E2433] text-xs flex items-center justify-center font-bold">
                {cartUnits}
              </span>
            )}
          </button>
          <Link to="/AdminLogin" aria-label="ניהול" className="w-11 h-11 rounded-xl border border-[#4A5268] hover:bg-[#2B3245] flex items-center justify-center transition-colors">
            <Settings className="w-5 h-5" />
          </Link>
        </div>
      </header>

      {/* ── System notices — one look for all ── */}
      {!networkOnline && (
        <PosNotice tone="danger">אין חיבור לאינטרנט — לא ניתן לבצע מכירות כרגע</PosNotice>
      )}
      {paidCharge && (
        <PosNotice action={(
          <button
            onClick={() => { if (window.confirm('להסיר את ההודעה? אם המכירה לא נשמרה — צריך לרשום אותה או לבטל את העסקה בנדרים ידנית.')) setPaidCharge(null); }}
            className="h-9 px-3 rounded-lg text-xs underline hover:bg-[#F3E2BC]">
            טופל — הסר הודעה
          </button>
        )}>
          חיוב אשראי של {money(paidCharge.amount)}{paidCharge.ref ? ` (אישור ${paidCharge.ref})` : ''} עבר בנדרים, אבל המכירה עוד לא נשמרה.
          לחצו שוב על תשלום — הוא לא יחויב שוב.
        </PosNotice>
      )}
      {unsentSales.length > 0 && (
        <PosNotice action={(
          <button onClick={sendUnsentSales} disabled={sendingUnsent}
            className="h-10 px-4 rounded-lg bg-[#5A3E0E] text-[#FFFDF8] font-medium hover:bg-[#46300B] disabled:opacity-60 shrink-0">
            {sendingUnsent ? 'שולח...' : 'שלח עכשיו'}
          </button>
        )}>
          {unsentSales.length === 1 ? 'מכירה אחת נשמרה במכשיר ולא הגיעה לשרת' : `${unsentSales.length} מכירות נשמרו במכשיר ולא הגיעו לשרת`}
        </PosNotice>
      )}
      {/* Pending network invitations — approve here to join the network */}
      {pendingInvitations.map(inv => (
        <BranchInvitationBanner key={inv.id} invitation={inv} userEmail={user?.email} />
      ))}
      <CatalogShareBanner branch={activeBranch} userEmail={user?.email} />

      <div className="flex-1 flex overflow-hidden">
        {/* ── Products side ── */}
        <div className={`flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 ${cartItems.length > 0 ? 'pb-28 lg:pb-5' : ''}`}>
          <SmartSearch
            stockModeEnabled={stockModeEnabled}
            groups={allGroups}
            variants={allVariants}
            categories={categories}
            onSelectGroup={handleGroupSelect}
            onSelectVariant={handleBarcodeSelect}
          />

          <PosBreadcrumb steps={crumbs} />

          {!selectedCategory ? (
            <>
              {categoriesError && (
                <PosNotice tone="danger">שגיאה בטעינת קטגוריות: {categoriesError.message}</PosNotice>
              )}
              {!user && <p className="text-sm text-[#5E5A52]">טוען משתמש...</p>}
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3.5">
                {/* Only top-level categories; each gets its own color */}
                {topCategories.map(category => {
                  const subCats = categories.filter(c => c.parent_id === category.id);
                  const allCatGroups = [
                    ...allGroups.filter(g => g.category_id === category.id),
                    ...subCats.flatMap(sc => allGroups.filter(g => g.category_id === sc.id)),
                  ];
                  const { tone, soft } = toneOf(category.id);
                  return (
                    <button key={category.id} onClick={() => { setSelectedCategory(category.id); setSelectedSubCategory(null); }}
                      className="flex flex-col text-right rounded-2xl overflow-hidden border-[1.5px] border-[#E2D8C4] bg-[#FFFDF8] hover:shadow-md hover:border-[#CDBF9F] active:scale-[0.98] transition-all min-h-[140px]">
                      <span className="block h-2.5 w-full" style={{ background: tone }} />
                      <span className="flex items-center gap-3.5 p-4">
                        <span className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0" style={{ background: soft, color: tone }}>
                          <Shirt className="w-7 h-7" strokeWidth={1.6} />
                        </span>
                        <span className="flex flex-col gap-1 min-w-0">
                          <span className="text-xl font-bold leading-tight" style={SERIF}>{category.name}</span>
                          <span className="text-sm text-[#5E5A52]">{allCatGroups.length} מוצרים</span>
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              {user && categories.length === 0 && (
                <div className="text-center py-12 text-[#5E5A52] text-sm">
                  אין קטגוריות להצגה — עבור לניהול מוצרים כדי להוסיף קטגוריות
                </div>
              )}
            </>
          ) : selectedCategory && subCategories.length > 0 && !selectedSubCategory ? (
            /* Sub-category selection */
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3.5">
              {subCategories.map(subCat => {
                const scGroups = allGroups.filter(g => g.category_id === subCat.id);
                const { tone, soft } = toneOf(selectedCategory);
                return (
                  <button key={subCat.id} onClick={() => setSelectedSubCategory(subCat.id)}
                    className="flex items-center gap-3.5 text-right p-4 rounded-2xl border-[1.5px] border-[#E2D8C4] bg-[#FFFDF8] hover:shadow-md hover:border-[#CDBF9F] active:scale-[0.98] transition-all min-h-[110px]">
                    <span className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: soft, color: tone }}>
                      <FolderOpen className="w-6 h-6" strokeWidth={1.6} />
                    </span>
                    <span className="flex flex-col gap-1 min-w-0">
                      <span className="text-lg font-bold leading-tight" style={SERIF}>{subCat.name}</span>
                      <span className="text-sm text-[#5E5A52]">{scGroups.length} מוצרים</span>
                    </span>
                  </button>
                );
              })}
              {/* Also show direct products of the main category if any */}
              {allGroups.filter(g => g.category_id === selectedCategory).length > 0 && (
                <button onClick={() => setSelectedSubCategory('__direct__')}
                  className="flex items-center gap-3.5 text-right p-4 rounded-2xl border-[1.5px] border-dashed border-[#CDBF9F] bg-[#FFFDF8] hover:shadow-md transition-all min-h-[110px]">
                  <span className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 bg-[#EDE4D2] text-[#5E5A52]">
                    <Shirt className="w-6 h-6" strokeWidth={1.6} />
                  </span>
                  <span className="flex flex-col gap-1">
                    <span className="text-lg font-bold" style={SERIF}>כללי</span>
                    <span className="text-sm text-[#5E5A52]">{allGroups.filter(g => g.category_id === selectedCategory).length} מוצרים</span>
                  </span>
                </button>
              )}
            </div>
          ) : (
            /* Products level */
            <ProductGrid
              groups={selectedSubCategory === '__direct__'
                ? allGroups.filter(g => g.category_id === selectedCategory)
                : groups}
              variants={allVariants}
              virtualFolders={virtualFolders}
              stockModeEnabled={stockModeEnabled}
              currentCategoryId={selectedSubCategory && selectedSubCategory !== '__direct__' ? selectedSubCategory : selectedCategory}
              tone={toneOf(selectedCategory).tone}
              onSelect={handleGroupSelect}
            />
          )}
        </div>

        {/* ── Cart (desktop) ── */}
        <aside className="hidden lg:flex w-[400px] border-r border-[#E2D8C4] p-4 flex-col">
          <Cart {...cartProps} />
        </aside>

        {/* ── Cart drawer (tablet / phone) ── */}
        {showCart && (
          <div className="lg:hidden fixed inset-0 z-40 bg-black/40" onClick={() => setShowCart(false)}>
            <div className="absolute left-0 top-0 bottom-0 w-[88%] max-w-[420px] bg-[#F5EFE3] p-4 shadow-xl flex flex-col"
              onClick={e => e.stopPropagation()}>
              <Cart {...cartProps} />
            </div>
          </div>
        )}
      </div>

      {/* ── Bottom bar (tablet / phone): the total is always in sight ── */}
      {cartItems.length > 0 && !showCart && (
        <div className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-[#FFFDF8] border-t border-[#E2D8C4] px-4 py-3 flex items-center gap-3 shadow-[0_-4px_16px_rgba(30,36,51,0.08)]">
          <button onClick={() => setShowCart(true)} className="h-14 px-4 rounded-xl border-[1.5px] border-[#E2D8C4] bg-[#F5EFE3] flex items-center gap-2 font-medium">
            <ShoppingCart className="w-5 h-5" /> עגלה ({cartUnits})
          </button>
          <button onClick={() => setShowCheckout(true)}
            className="flex-1 h-14 rounded-xl bg-[#2E6B4C] hover:bg-[#25573D] text-white text-lg font-bold flex items-center justify-center gap-2 active:scale-[0.99] transition-all">
            <CreditCard className="w-5 h-5" /> לתשלום {money(cartTotal)}
          </button>
        </div>
      )}

