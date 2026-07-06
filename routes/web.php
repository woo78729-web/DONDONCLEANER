<?php

use App\Http\Controllers\GoogleAuthController;
use App\Http\Controllers\PublicStorageController;
use App\Http\Controllers\SpaPageController;
use Illuminate\Support\Facades\Route;

Route::redirect('/', '/spa/');

Route::get('/storage/{path}', [PublicStorageController::class, 'show'])
    ->where('path', '.*');

Route::get('/spa', [SpaPageController::class, 'index']);
Route::get('/spa/', [SpaPageController::class, 'index']);
Route::get('/spa/{path}', [SpaPageController::class, 'path'])->where('path', '.*');

Route::get('/auth/google/redirect', [GoogleAuthController::class, 'redirect'])->name('auth.google.redirect');
Route::get('/auth/google/callback', [GoogleAuthController::class, 'callback'])->name('auth.google.callback');
