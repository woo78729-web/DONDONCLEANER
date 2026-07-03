<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\File;
use Symfony\Component\HttpFoundation\Response;

class SpaPageController extends Controller
{
    public function index(): Response
    {
        return $this->indexResponse();
    }

    public function path(?string $path = null): Response
    {
        $spaRoot = public_path('spa');

        if ($path) {
            $assetPath = $spaRoot.DIRECTORY_SEPARATOR.str_replace('/', DIRECTORY_SEPARATOR, $path);

            if (File::isFile($assetPath)) {
                return response()->file($assetPath);
            }
        }

        return $this->indexResponse();
    }

    private function indexResponse(): Response
    {
        $indexPath = public_path('spa/index.html');

        if (! File::isFile($indexPath)) {
            return response(
                '前端尚未建置，請在專案根目錄執行：cd web-app && npm install && npm run build',
                503
            );
        }

        return response()->file($indexPath);
    }
}
